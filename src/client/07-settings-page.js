    function GitHubCopilotSettings() {
      useLocaleRevision();
      const [status, setStatus] = useState();
      const [accounts, setAccounts] = useState();
      const [accountsError, setAccountsError] = useState();
      const [busy, setBusy] = useState(false);
      const [switchingAccountId, setSwitchingAccountId] = useState();
      const [error, setError] = useState();
      const [copied, setCopied] = useState(false);
      const [confirmLogout, setConfirmLogout] = useState(false);
      const [acknowledged, setAcknowledged] = useState(false);

      const refresh = async () => {
        let next;
        try {
          next = await request("/status");
          setStatus(next);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
          return void 0;
        }
        try {
          const accountResult = await request("/accounts");
          setAccounts(accountResult.accounts);
          setAccountsError(void 0);
        } catch (cause) {
          setAccountsError(cause instanceof Error ? cause.message : String(cause));
        }
        setError(void 0);
        return next;
      };
      useEffect(() => {
        let alive = true;
        refresh().then(
          () => {},
          (cause) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); }
        );
        return () => { alive = false; };
      }, []);
      useEffect(() => {
        if (status?.state !== "pending") return;
        const timer = setInterval(() => { void refresh(); }, 2e3);
        return () => { clearInterval(timer); };
      }, [status?.state]);

      const login = async () => {
        setBusy(true);
        setError(void 0);
        try {
          const next = await request("/login", "POST");
          setStatus(next);
          if (next.authenticated) await refresh();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setBusy(false);
        }
      };
      const logout = async () => {
        setBusy(true);
        setError(void 0);
        try {
          setStatus(await request("/logout", "POST"));
          await refresh();
          setConfirmLogout(false);
          setAcknowledged(false);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setBusy(false);
        }
      };
      const switchAccount = async (accountId) => {
        setBusy(true);
        setSwitchingAccountId(accountId);
        setError(void 0);
        try {
          const result = await request("/switch", "POST", { accountId });
          setAccounts(result.accounts);
          await refresh();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setBusy(false);
          setSwitchingAccountId(void 0);
        }
      };
      const copy = async () => {
        if (await writeClipboard(status?.userCode ?? "")) setCopied(true);
      };
      const pending = status?.state === "pending";
      const authenticated = status?.authenticated === true;
      return jsxs("section", {
        style: css.section,
        children: [
          jsx("h2", { style: css.title, children: text("title") }),
          jsx("p", { style: css.intro, children: text("intro") }),
          jsxs("div", {
            style: css.card,
            children: [
              jsxs("div", {
                style: css.row,
                children: [
                  jsx(StateLabel, { status }),
                  jsxs("div", {
                    style: css.actions,
                    children: [
                      authenticated
                        ? jsx(Button, {
                            variant: "outline",
                            disabled: busy,
                            onClick: () => { setAcknowledged(false); setConfirmLogout(true); },
                            children: busy ? text("processing") : text("signOut")
                          })
                        : jsx(Button, {
                            variant: "primary",
                            disabled: busy || pending,
                            onClick: () => { void login(); },
                            children: busy ? text("requesting") : pending ? text("waiting") : text("signIn")
                          }),
                      jsx(Button, { variant: "outline", disabled: busy, onClick: () => { void refresh(); }, children: text("refresh") })
                    ]
                  })
                ]
              }),
              error === void 0 ? null : jsx("p", { role: "alert", style: css.error, children: error }),
              status?.credentialRemaining
                ? jsx("p", { role: "status", style: css.body, children: text("remainingCredentialHint", { credential: status.credential }) })
                : null,
              pending
                ? jsxs(React.Fragment, {
                    children: [
                      jsx("p", { style: css.body, children: text("pendingIntro") }),
                      jsx("a", { href: status.verificationUri, target: "_blank", rel: "noreferrer", style: css.link, children: status.verificationUri }),
                      jsx(DeviceCodeField, { value: status.userCode ?? "", copied, onCopy: () => { void copy(); } }),
                      jsx("p", { style: css.hint, children: text("pendingHint") })
                    ]
                  })
                : null,
              !authenticated && !pending && status?.message ? jsx("p", { style: css.error, children: status.message }) : null,
              authenticated && !status?.credentialRemaining
                ? jsxs(React.Fragment, {
                    children: [
                      jsx("p", { style: css.body, children: text("credential", { credential: status.credential ?? "GITHUB_COPILOT_OAUTH_TOKEN" }) }),
                      typeof status.modelCount === "number"
                        ? jsx("p", { style: { ...css.body, fontWeight: 500 }, children: text("models", { count: status.modelCount }) })
                        : null,
                      jsx("p", { style: css.hint, children: text("whereToSelect", { provider: status.provider ?? "github-copilot" }) })
                    ]
                  })
                : null,
              jsxs("div", {
                style: css.accountList,
                children: [
                  jsx("strong", { style: css.body, children: text("accountsTitle") }),
                  jsx("p", { style: css.hint, children: text("accountsIntro") }),
                  accountsError
                    ? jsx("p", { role: "alert", style: css.error, children: accountsError })
                    : accounts === void 0
                      ? jsx("p", { style: css.hint, children: text("accountsLoading") })
                      : accounts.length === 0
                        ? jsx("p", { style: css.hint, children: text("accountsEmpty") })
                        : accounts.map((account) => jsxs("div", {
                          style: css.accountRow,
                          children: [
                            jsxs("div", {
                              style: css.accountMeta,
                              children: [
                                jsxs("span", {
                                  style: css.body,
                                  children: [
                                    account.name,
                                    account.active ? ` · ${text("accountActive")}` : ""
                                  ]
                                }),
                                jsx("span", { style: css.accountId, children: account.id }),
                                account.credentialAvailable
                                  ? null
                                  : jsx("span", { style: css.hint, children: text("accountCredentialMissing") })
                              ]
                            }),
                            jsx(Button, {
                              variant: account.active ? "outline" : "primary",
                              disabled: busy || !account.credentialAvailable || account.active,
                              onClick: () => { void switchAccount(account.id); },
                              children: switchingAccountId === account.id
                                ? text("switchingAccount")
                                : text("switchAccount")
                            })
                          ]
                        }, account.id))
                ]
              })
            ]
          }),
          jsx("p", { style: css.hint, children: text("commandHint") }),
          jsxs("p", {
            style: css.hint,
            children: [
              text("pluginVersion"),
              " ",
              jsx("a", {
                href: `https://github.com/lujianjun19/dsh-llm-github-copilot/releases/tag/v${PLUGIN_VERSION}`,
                target: "_blank",
                rel: "noreferrer",
                style: css.versionLink,
                children: `@lujianjun19/dsh-llm-github-copilot v${PLUGIN_VERSION}`
              })
            ]
          }),
          jsx(RiskConfirmation, {
            open: confirmLogout,
            title: text("logoutConfirmTitle"),
            description: text("logoutConfirmDescription"),
            acknowledgeLabel: text("logoutAcknowledge"),
            cancelLabel: text("cancel"),
            closeLabel: text("close"),
            confirmLabel: text("logoutConfirm"),
            acknowledged,
            disabled: busy,
            onAcknowledgedChange: setAcknowledged,
            onCancel: () => { if (!busy) { setConfirmLogout(false); setAcknowledged(false); } },
            onConfirm: () => { void logout(); }
          })
        ]
      });
    }
