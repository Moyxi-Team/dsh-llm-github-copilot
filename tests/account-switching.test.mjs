import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { grantToken, mergeQuotaAccounts, piAiGrantRecord, piAiRecordKey } from '../lib/index.js'
import { credentialFixture } from './helpers/credential-fixture.mjs'

const SECRET_FIXTURES = {
  apiKey: 'fixture-secret-api-key',
  sessionToken: 'fixture-secret-session-token',
  token: 'fixture-secret-token',
  sessionKey: 'fixture-secret-session-key',
  publicApiKey: 'fixture-public-api-key',
}

function quotaConfig() {
  return {
    accounts: [
      { id: 'api', provider: 'github_copilot', name: 'API account', apiKey: null },
      { id: 'session', provider: 'github_copilot', name: 'Session account', sessionToken: '' },
      { id: 'token', provider: 'github_copilot', displayName: 'Token account', token: null },
      { id: 'key', provider: 'github_copilot', label: 'Key account', sessionKey: null },
      { id: 'public', provider: 'github_copilot', name: 'Public fallback', apiKey: SECRET_FIXTURES.publicApiKey },
      { id: 'empty', provider: 'github_copilot', name: 'No credential', apiKey: null, token: '' },
      { id: 'other', provider: 'other_provider', name: 'Not Copilot', token: null },
    ],
  }
}

function quotaSecrets() {
  return {
    version: 1,
    secrets: {
      providers: {},
      accounts: {
        key: { sessionKey: SECRET_FIXTURES.sessionKey },
        token: { token: SECRET_FIXTURES.token },
        session: { sessionToken: SECRET_FIXTURES.sessionToken },
        api: { apiKey: SECRET_FIXTURES.apiKey },
        public: { apiKey: 'fixture-must-not-replace-public-value' },
        empty: {},
      },
      custom: {},
    },
  }
}

async function writeQuotaFiles(home, config = quotaConfig(), secrets = quotaSecrets()) {
  await writeFile(join(home, 'quota-config.json'), typeof config === 'string' ? config : JSON.stringify(config))
  if (secrets !== undefined) {
    await writeFile(join(home, 'quota-secrets.json'), typeof secrets === 'string' ? secrets : JSON.stringify(secrets))
  }
}

test('quota account secrets merge by ID, restore four secret fields, and preserve nonempty public fields', () => {
  const accounts = mergeQuotaAccounts(quotaConfig().accounts, quotaSecrets().secrets.accounts)
  const byId = new Map(accounts.map(account => [account.id, account]))
  assert.equal(byId.get('api').apiKey, SECRET_FIXTURES.apiKey)
  assert.equal(byId.get('session').sessionToken, SECRET_FIXTURES.sessionToken)
  assert.equal(byId.get('token').token, SECRET_FIXTURES.token)
  assert.equal(byId.get('key').sessionKey, SECRET_FIXTURES.sessionKey)
  assert.equal(byId.get('public').apiKey, SECRET_FIXTURES.publicApiKey)
  assert.equal(byId.get('empty').apiKey, null)
  assert.equal(byId.get('empty').token, '')
  assert.equal(byId.has('other'), true, 'non-Copilot records remain available for provider validation')
})

test('accounts API maps reordered records by ID, marks the active account, and never returns credentials', async t => {
  const { dir, request } = await credentialFixture(t, {
    quotaHome: true,
    seed: store => store.modifyRecord(piAiRecordKey(), async () => piAiGrantRecord(SECRET_FIXTURES.sessionToken)),
  })
  await writeQuotaFiles(dir)

  const result = await request('accounts')
  assert.deepEqual(result.accounts.map(({ id, name, credentialAvailable, active }) => ({ id, name, credentialAvailable, active })), [
    { id: 'api', name: 'API account', credentialAvailable: true, active: false },
    { id: 'session', name: 'Session account', credentialAvailable: true, active: true },
    { id: 'token', name: 'Token account', credentialAvailable: false, active: false },
    { id: 'key', name: 'Key account', credentialAvailable: false, active: false },
    { id: 'public', name: 'Public fallback', credentialAvailable: true, active: false },
    { id: 'empty', name: 'No credential', credentialAvailable: false, active: false },
  ])
  const serialized = JSON.stringify(result)
  for (const secret of Object.values(SECRET_FIXTURES)) assert.ok(!serialized.includes(secret))
})

test('switch persists the selected credential and refreshes the active account state without returning secrets', async t => {
  const { dir, credentials, request } = await credentialFixture(t, {
    quotaHome: true,
    seed: store => store.modifyRecord(piAiRecordKey(), async () => piAiGrantRecord(SECRET_FIXTURES.apiKey)),
  })
  await writeQuotaFiles(dir)

  const switched = await request('switch', 'POST', { accountId: 'session' })
  assert.equal(switched.activeAccountId, 'session')
  assert.deepEqual(switched.accounts.filter(account => account.active).map(account => account.id), ['session'])
  assert.equal(grantToken(await credentials.readRecord(piAiRecordKey())), SECRET_FIXTURES.sessionToken)
  assert.equal((await credentials.resolve('GITHUB_COPILOT_OAUTH_TOKEN'))?.value, SECRET_FIXTURES.sessionToken)
  assert.ok(!JSON.stringify(switched).includes(SECRET_FIXTURES.sessionToken))
  assert.equal((await request('accounts')).accounts.find(account => account.active)?.id, 'session')
})

test('switch rejects unknown accounts, other providers, missing credentials, and malformed bodies explicitly', async t => {
  const { dir, requestRaw } = await credentialFixture(t, { quotaHome: true })
  await writeQuotaFiles(dir)

  for (const [body, status, message] of [
    [{ accountId: 'unknown' }, 404, /does not exist/],
    [{ accountId: 'other' }, 422, /not a GitHub Copilot/],
    [{ accountId: 'empty' }, 422, /no saved credential/],
    [{}, 400, /valid account ID/],
    ['not-json', 400, /valid account ID/],
  ]) {
    const { response, payload } = await requestRaw('switch', 'POST', body)
    assert.equal(response.status, status)
    assert.equal(payload.ok, false)
    assert.match(payload.error, message)
    assert.ok(!JSON.stringify(payload).includes(Object.values(SECRET_FIXTURES).join('')))
  }
})

test('missing files, invalid JSON, and unreadable file types return explicit safe errors', async t => {
  const { dir, requestRaw } = await credentialFixture(t, { quotaHome: true })
  let result = await requestRaw('accounts')
  assert.equal(result.response.status, 404)
  assert.match(result.payload.error, /quota-config\.json file is missing/)

  await writeFile(join(dir, 'quota-config.json'), '{')
  result = await requestRaw('accounts')
  assert.equal(result.response.status, 422)
  assert.match(result.payload.error, /quota-config\.json file contains invalid JSON/)

  await writeFile(join(dir, 'quota-config.json'), JSON.stringify(quotaConfig()))
  result = await requestRaw('accounts')
  assert.equal(result.response.status, 404)
  assert.match(result.payload.error, /quota-secrets\.json file is missing/)

  await writeFile(join(dir, 'quota-secrets.json'), '{')
  result = await requestRaw('accounts')
  assert.equal(result.response.status, 422)
  assert.match(result.payload.error, /quota-secrets\.json file contains invalid JSON/)

  await rm(join(dir, 'quota-secrets.json'))
  await mkdir(join(dir, 'quota-secrets.json'))
  result = await requestRaw('accounts')
  assert.equal(result.response.status, 500)
  assert.match(result.payload.error, /quota-secrets\.json file could not be read/)
  assert.ok(!JSON.stringify(result.payload).includes(dir))
})

test('a failed credential write is reported without exposing storage errors or credentials', async t => {
  const { dir, credentials, requestRaw } = await credentialFixture(t, { quotaHome: true })
  await writeQuotaFiles(dir)
  t.mock.method(credentials, 'modifyRecord', async () => {
    throw new Error(`synthetic failure containing ${SECRET_FIXTURES.apiKey}`)
  })

  const { response, payload } = await requestRaw('switch', 'POST', { accountId: 'api' })
  assert.equal(response.status, 500)
  assert.equal(payload.ok, false)
  assert.match(payload.error, /could not be saved to Harness credentials/)
  assert.ok(!JSON.stringify(payload).includes(SECRET_FIXTURES.apiKey))
})
