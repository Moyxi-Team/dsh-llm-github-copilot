//#region quota account switching
const QUOTA_PROVIDER = "github_copilot";
const QUOTA_CONFIG_FILE = "quota-config.json";
const QUOTA_SECRETS_FILE = "quota-secrets.json";
const SECRET_STRING_KEYS = ["apiKey", "sessionToken", "token", "sessionKey"];

class CopilotAccountError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "CopilotAccountError";
    this.status = status;
  }
}

function quotaHome() {
  return resolve(process.env.DSH_HOME || join(homedir(), ".dsh"));
}

function quotaFiles(home = quotaHome()) {
  return {
    config: join(home, QUOTA_CONFIG_FILE),
    secrets: join(home, QUOTA_SECRETS_FILE)
  };
}

async function readQuotaJson(path, kind) {
  let contents;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new CopilotAccountError(`The GitHub Copilot ${kind} file is missing.`, 404);
    }
    if (error?.code === "EACCES" || error?.code === "EPERM") {
      throw new CopilotAccountError(`The GitHub Copilot ${kind} file cannot be read; check its permissions.`);
    }
    throw new CopilotAccountError(`The GitHub Copilot ${kind} file could not be read.`);
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new CopilotAccountError(`The GitHub Copilot ${kind} file contains invalid JSON.`, 422);
  }
}

function mergeQuotaAccounts(accounts, secretAccounts) {
  const ids = new Set();
  for (const account of accounts) {
    if (account === null || typeof account !== "object" || account.id === null || account.id === void 0) continue;
    const id = String(account.id);
    if (ids.has(id)) throw new CopilotAccountError("The quota-config.json contains duplicate account IDs.", 422);
    ids.add(id);
  }

  return accounts.map((account) => {
    if (account === null || typeof account !== "object") return account;
    const id = String(account.id ?? "");
    const merged = { ...account };
    const accountSecrets = secretAccounts[id];
    if (accountSecrets !== null && typeof accountSecrets === "object" && !Array.isArray(accountSecrets)) {
      for (const key of SECRET_STRING_KEYS) {
        const publicValue = merged[key];
        if ((publicValue === null || publicValue === void 0 || publicValue === "")
          && typeof accountSecrets[key] === "string" && accountSecrets[key].length > 0) {
          merged[key] = accountSecrets[key];
        }
      }
    }
    return merged;
  });
}

async function readQuotaAccounts(home = quotaHome()) {
  const files = quotaFiles(home);
  const config = await readQuotaJson(files.config, "quota-config.json");
  if (!Array.isArray(config?.accounts)) {
    throw new CopilotAccountError("The quota-config.json accounts list is invalid.", 422);
  }
  const secrets = await readQuotaJson(files.secrets, "quota-secrets.json");
  const secretAccounts = secrets?.version === 1 && secrets?.secrets?.accounts;
  if (secretAccounts === null || typeof secretAccounts !== "object" || Array.isArray(secretAccounts)) {
    throw new CopilotAccountError("The quota-secrets.json accounts map is invalid.", 422);
  }
  return mergeQuotaAccounts(config.accounts, secretAccounts);
}

function accountCredentials(account) {
  return ["apiKey", "sessionToken"]
    .map((key) => account[key])
    .filter((value) => typeof value === "string" && value.length > 0);
}

function publicQuotaAccount(account, activeToken) {
  const id = String(account.id);
  const credentials = accountCredentials(account);
  return {
    id,
    name: [account.name, account.displayName, account.label].find((value) => typeof value === "string" && value.trim().length > 0)?.trim()
      ?? "GitHub Copilot account",
    credentialAvailable: credentials.length > 0,
    active: activeToken !== void 0 && credentials.some((value) => value === activeToken)
  };
}

async function listCopilotAccounts(activeToken, home) {
  const accounts = await readQuotaAccounts(home);
  return accounts
    .filter((account) => account?.provider === QUOTA_PROVIDER
      && account.id !== null && account.id !== void 0 && String(account.id).length > 0)
    .map((account) => publicQuotaAccount(account, activeToken));
}

function accountResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function accountAction(action) {
  try {
    return accountResponse(200, { ok: true, value: await action() });
  } catch (error) {
    const status = error instanceof CopilotAccountError ? error.status : 500;
    const message = error instanceof CopilotAccountError
      ? error.message
      : "The GitHub Copilot account operation failed.";
    return accountResponse(status, { ok: false, error: message });
  }
}

function registerAccountSwitchingRoutes(connection, { resolveRawOAuthToken, storeRawOAuthToken }) {
  return [
    connection.fetch.register({
      path: "/api/github-copilot-auth/accounts",
      methods: ["GET"],
      requestBody: "buffered",
      fetch: () => accountAction(async () => ({
        accounts: await listCopilotAccounts(await resolveRawOAuthToken())
      }))
    }),
    connection.fetch.register({
      path: "/api/github-copilot-auth/switch",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => accountAction(async () => {
        let payload;
        try {
          payload = await request.json();
        } catch {
          throw new CopilotAccountError("A valid account ID is required.", 400);
        }
        if (typeof payload?.accountId !== "string" || payload.accountId.length === 0) {
          throw new CopilotAccountError("A valid account ID is required.", 400);
        }
        const accounts = await readQuotaAccounts();
        const matches = accounts.filter((account) => String(account?.id ?? "") === payload.accountId);
        if (matches.length === 0) throw new CopilotAccountError("The selected quota account does not exist.", 404);
        if (matches.length !== 1) throw new CopilotAccountError("The selected quota account ID is ambiguous.", 422);
        const account = matches[0];
        if (account?.provider !== QUOTA_PROVIDER) {
          throw new CopilotAccountError("The selected account is not a GitHub Copilot quota account.", 422);
        }
        const token = accountCredentials(account)[0];
        if (token === void 0) {
          throw new CopilotAccountError("The selected GitHub Copilot account has no saved credential.", 422);
        }
        try {
          await storeRawOAuthToken(token);
        } catch {
          throw new CopilotAccountError("The selected account could not be saved to Harness credentials.");
        }
        return {
          accounts: await listCopilotAccounts(token),
          activeAccountId: payload.accountId
        };
      })
    })
  ];
}
//#endregion
