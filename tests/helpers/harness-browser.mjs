import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

async function api(page, action, method = 'GET', body) {
  return page.evaluate(async ({ action, method, body }) => {
    const response = await fetch(`/api/github-copilot-auth/${action}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    })
    if (!response.ok) throw new Error(`Copilot ${action}: HTTP ${response.status}`)
    const payload = await response.json()
    if (!payload.ok) throw new Error(payload.error)
    return payload.value
  }, { action, method, body })
}

async function openSettings(page, url) {
  await page.goto(url)
  // Fresh Harness homes show the preview notice and optional DeepSeek onboarding.
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor({ timeout: 15000 })
    .then(() => page.getByRole('button', { name: 'Continue', exact: true }).click(), () => {})
  const onboarding = page.getByRole('dialog').filter({ hasText: 'Get started' })
  await onboarding.waitFor({ timeout: 3000 }).then(
    () => onboarding.getByRole('button', { name: 'Close', exact: true }).click(), () => {},
  )
  const launcher = page.getByRole('button', { name: /^(Account menu|Settings)$/ }).first()
  await launcher.waitFor()
  const menu = await launcher.getAttribute('aria-label') === 'Account menu'
  await launcher.click()
  if (menu) await page.getByText('Settings', { exact: true }).click()
  await page.getByRole('button', { name: 'GitHub Copilot', exact: true }).click()
}

/**
 * The navigation row shows exactly one Copilot glyph. Shells that declare
 * settings.section.icon render it inside the slot; older shells get the DOM
 * fallback. Selecting the row re-renders it, so this also covers that path.
 */
async function checkNavIcon(page, iconSlot) {
  const row = page.getByRole('button', { name: 'GitHub Copilot', exact: true })
  await row.locator('svg[data-github-copilot-icon="true"]').waitFor()
  assert.equal(await row.locator('svg').count(), 1, 'one navigation glyph')
  const slotted = await row.locator('[data-slot="settings.section.icon"] svg[data-github-copilot-icon="true"]').count()
  assert.equal(slotted, iconSlot ? 1 : 0, iconSlot ? 'glyph rendered by the icon slot' : 'DOM fallback without an icon slot')
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign out of GitHub Copilot?', exact: true })
  await dialog.waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Close', exact: true }).count(), 1)
  const confirm = dialog.getByRole('button', { name: 'Sign out', exact: true })
  assert.equal(await confirm.isDisabled(), true)
  await dialog.getByRole('checkbox').check()
  await confirm.click()
  await dialog.waitFor({ state: 'hidden' })
}

async function switchFixtureAccount(page) {
  const result = await api(page, 'accounts')
  assert.deepEqual(result.accounts.map(({ id, name, credentialAvailable, active }) => ({
    id, name, credentialAvailable, active,
  })), [
    { id: 'fixture-account-a', name: 'Fixture Account A', credentialAvailable: true, active: false },
    { id: 'fixture-account-b', name: 'Fixture Account B', credentialAvailable: true, active: false },
  ])
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret/)
  await page.getByText('Fixture Account A', { exact: false }).waitFor()
  await page.getByText('Fixture Account B', { exact: false }).waitFor()

  await page.route('**/api/github-copilot-auth/switch', async route => {
    await new Promise(resolve => setTimeout(resolve, 300))
    await route.continue()
  })
  const switchButton = page.getByRole('button', { name: 'Switch account', exact: true }).nth(1)
  await switchButton.click()
  const busyButton = page.getByRole('button', { name: 'Switching…', exact: true })
  await busyButton.waitFor()
  assert.equal(await busyButton.isDisabled(), true)
  await page.getByText('Fixture Account B · Active', { exact: true }).waitFor()
  await page.unroute('**/api/github-copilot-auth/switch')

  const updated = await api(page, 'accounts')
  assert.equal(updated.accounts.find(account => account.active)?.id, 'fixture-account-b')
  assert.doesNotMatch(JSON.stringify(updated), /fixture-secret/)
  assert.doesNotMatch(await page.locator('body').innerText(), /fixture-secret/)
}

/** Real browser + shipped Harness services; only GitHub responses are fixtures. */
export async function checkHarnessBrowser(url, { ambient, artifacts, iconSlot }) {
  const browser = await chromium.launch({ headless: true })
  const errors = []
  let page
  try {
    page = await browser.newPage({ locale: 'en-US' })
    page.on('pageerror', error => errors.push(error.message))
    await openSettings(page, url)
    await checkNavIcon(page, iconSlot)
    if (ambient) {
      await switchFixtureAccount(page)
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor()
      assert.equal((await api(page, 'status')).authenticated, true)
      await signOut(page)
      await page.getByText('External token still present', { exact: true }).waitFor()
      assert.match(await page.getByRole('status').innerText(), /GITHUB_COPILOT_OAUTH_TOKEN.*still supplies a token/)
      const status = await api(page, 'status')
      assert.equal(status.credentialRemaining, true)
      assert.equal(status.authenticated, true)
      await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
      await page.getByText('External token still present', { exact: true }).waitFor()
    } else {
      const login = page.getByRole('button', { name: 'Sign in to GitHub Copilot', exact: true })
      await login.waitFor()
      assert.equal((await api(page, 'status')).authenticated, false)
      await login.click()
      await page.getByRole('textbox', { name: 'Device code', exact: true }).waitFor()
      assert.equal(await page.getByRole('textbox', { name: 'Device code', exact: true }).inputValue(), 'TEST-CODE')
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor()
      const status = await api(page, 'status')
      assert.equal(status.authenticated, true)
      assert.equal(status.credentialRemaining, undefined)
      await switchFixtureAccount(page)
      await signOut(page)
      await login.waitFor()
      assert.equal((await api(page, 'status')).authenticated, false)
    }
    assert.deepEqual(errors, [], 'client modules must load and render without uncaught errors')
  } catch (error) {
    if (page && artifacts) {
      await writeFile(join(artifacts, 'page.txt'), await page.locator('body').innerText())
      await page.screenshot({ path: join(artifacts, 'page.png') })
    }
    throw error
  } finally {
    await browser.close()
  }
}
