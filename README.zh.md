# dsh-llm-github-copilot

[English](README.md) | 中文

> **上游/原项目：** [`lujianjun19/dsh-llm-github-copilot`](https://github.com/lujianjun19/dsh-llm-github-copilot)。当前仓库是基于该项目源码、由 **Moyxi-Team 独立维护**的组织仓库；此处标注来源，不代表声称 GitHub 将本仓库标记为 fork。组织版额外提供已保存的 GitHub Copilot quota 账号切换。详见[项目来源与差异](#项目来源与差异)。

## 项目来源与差异

差异核对时间为 2026-11-06，基准为上游 `main` 的 [`0e327a9`](https://github.com/lujianjun19/dsh-llm-github-copilot/commit/0e327a90a47595ab732e72ec38e23cad7feb9633)。组织仓库 `main` 当前位于 [`e106b4e`](https://github.com/Moyxi-Team/dsh-llm-github-copilot/commit/e106b4e389b2a3135bf0db477a19ca7ab100c503)，比该上游基准多两个提交。可核实的组织版额外差异包括：

- 新增 Host API 和中英文设置界面，用于切换已保存的 `github_copilot` quota 账号。
- 按账号 ID 配对 quota 账号元数据与 secrets，再通过 Harness 凭据服务激活所选凭据。浏览器只接收公开账号信息和活动状态，不会收到 token 或 token 后缀。
- 新增基于合成 fixture 的 quota 合并、账号切换、错误处理和浏览器行为测试。
- 更新本仓库的双语说明及组织安装地址。上游 npm 包仍是独立发布渠道：2026-11-06 核实到的版本为 `0.4.12`；本 GitHub 仓库的变更不会自动更新该 npm 包，通过 npm 更新也不会更新从 GitHub 安装的版本。

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 GitHub Copilot 登录。

本插件提供 GitHub OAuth 设备流登录页面和斜杠命令，并写入 Harness 内置 `github-copilot` 提供方使用的凭据。它**不注册 LLM 适配器**，也不维护模型目录：token 交换与刷新、模型可用性、请求、图片和流式处理均由 Harness 的 `@deepseek-ai/dsh-llm-pi-ai` 路由负责。可用模型取决于该路由的目录和账号权限，而不只取决于 Copilot 订阅。参见 [ADR-0002](docs/adr/0002-narrow-to-credential-provider.md)。

本项目不是 DeepSeek 或 GitHub 官方产品。切换账号要求 `${DSH_HOME:-~/.dsh}` 中的 `quota-config.json` 和 `quota-secrets.json` 可读且格式有效，并且其中存在 `github_copilot` 账号及所选账号支持的凭据。本插件只读取这些文件以提供切换功能，再通过 Harness 写入所选凭据；不会创建、编辑或删除 quota 账号或文件。完整行为和限制见[切换已保存账号](#切换已保存账号)。

## 依赖要求

- **支持的 Harness 版本：** `0.1.7-rc.1` 至 `0.1.7-rc.2`、`0.2.0-rc.1` 至 `0.2.0-rc.2`、`0.2.1-rc.2` 至 `0.2.1-rc.5`，以及 `0.2.2-rc.1`，搭配 `@deepseek-ai/cordis` `^4.0.4`。开发基线为 `0.2.2-rc.1`，Cordis `^4.1.0`。`0.2.2-alpha.3` 仍仅作为不阻塞的 CI 预览，不属于支持版本。
- **声明的 Harness peer 范围：** `^0.1.7-rc.1 || ^0.2.0-rc.1 || ^0.2.1-rc.2 || ^0.2.2-rc.1`（见 [`package.json`](package.json)）。不能把 npm 持续变化的 `latest`/`next` 标签当成支持承诺。验证范围见 [Harness 兼容性评估](docs/dsh-v0.2.1-rc.3-compatibility-analysis.md)。
- Harness 自带的 `@deepseek-ai/dsh-llm-pi-ai` 路由，以及 `dsh-credentials-local` 等凭据服务。默认 Web profile 已提供这些组件，自定义组合需自行挂载。
- 一个有 Copilot 使用权限的 GitHub 账号。
- Node.js ≥ 24；执行 `dsh plugin` 命令时，`PATH` 中须有 pnpm ≥ 9。

## 安装

以下命令均针对 `web` profile。其默认目录是 `~/.dsh/profiles/web`；设置了 `DSH_HOME` 时则为 `$DSH_HOME/profiles/web`。

### 从 Moyxi-Team GitHub 源码安装（含账号切换）

```sh
dsh plugin --profile web add github:Moyxi-Team/dsh-llm-github-copilot -w
```

这会安装组织仓库的默认分支。需要组织版账号切换功能时，请使用此源码渠道，而不是上游 npm 包。如果 pnpm 提示需要批准构建，请将**提示中的精确键名**加入 profile 的 `pnpm-workspace.yaml` 中的 `allowBuilds`，然后重新执行安装命令。不要根据仓库名猜测键名。

### 从上游 npm 包安装（上游发布渠道）

```sh
dsh plugin --profile web add @lujianjun19/dsh-llm-github-copilot -w
```

`dsh plugin` 会将本包注册到 profile 的 `dsh.profile.bundles`，并加载包内的 `cordis.patch.yml`。**不要再向 profile patch 添加本插件的 `insert` 条目。** 如果旧安装保留了手动注册，请在采用 bundle 安装时移除重复条目。

停止正在运行的实例，然后重新启动该 profile：

```sh
dsh web
```

更新插件的客户端 bundle 后，对已打开的浏览器标签页执行硬刷新。

## 更新

更新 npm 发布渠道时，通过 Harness 的包管理入口操作，以保持 profile 的 pnpm lockfile 和 bundle 列表同步：

```sh
dsh plugin --profile web update @lujianjun19/dsh-llm-github-copilot --latest -w
```

如需指定版本，将 `X.Y.Z` 替换为目标版本号：

```sh
dsh plugin --profile web add @lujianjun19/dsh-llm-github-copilot@X.Y.Z -w
```

profile 的 pnpm `minimumReleaseAge` 策略可能延迟新版本的安装。如果实际安装版本偏旧，请检查该策略；确需放行时，仅将目标包和版本加入 `minimumReleaseAgeExclude`，再按精确版本安装。不要假设 `@latest` 一定选中了目标版本，也不要在 pnpm 管理的 profile 中混用 `npm install`。

更新 Moyxi-Team GitHub 版本时，重新执行上面的 GitHub 安装命令以安装默认分支。npm 更新命令不会更新从 GitHub 安装的版本。

重启 DSH 并硬刷新浏览器。在 **设置 → GitHub Copilot** 页面底部确认安装版本，或执行：

```sh
dsh plugin --profile web list @lujianjun19/dsh-llm-github-copilot
```

## 登录

打开 **设置 → GitHub Copilot** 并点击**登录**，也可以在 Harness 对话框中运行：

```text
/copilot-login
```

在浏览器中打开提示的 GitHub 验证链接，输入设备码，并授权 GitHub App（VS Code）。Host 会在后台持续轮询，授权完成后自动保存凭据。Web 登录界面会自动更新，聊天命令弹出的登录对话框会在检测到登录成功后关闭。

查看已保存的凭据状态：

```text
/copilot-status
```

`authenticated` 仅表示存在长期 token，**不代表已通过实际 API 请求验证**。只有下游路由已记录 `availableModelIds` 时，该命令才报告模型**数量**；它不会请求或列出模型。路由首次交换 token 前，可能没有数量信息。

### 切换已保存账号

当 `dsh-quota` 已保存 GitHub Copilot 账号时，**设置 → GitHub Copilot** 会列出公开账号名称和 ID、凭据是否可用以及当前活动账号标记。点击**切换账号**后，插件通过 Harness 标准凭据写入流程发布该账号凭据，页面随后重新读取活动标记。内置 `github-copilot` 路由仍负责模型发现与刷新。

账号列表读取自 `${DSH_HOME:-~/.dsh}` 下的 `quota-config.json`；敏感字段通过账号 ID 与 `quota-secrets.json` 配对。浏览器 API 不会返回凭据或其后缀。两个文件都必须可读且格式有效。切换账号不会创建、修改或删除 quota 文件。另见 [English documentation](README.md#switch-saved-accounts)。

删除本机凭据：

```text
/copilot-logout
```

Web 界面会要求确认。退出登录会删除 grant 和可写的 token 引用，但不会撤销 GitHub 上的授权，也不会删除已配置的模型提供方。如果只读引用或环境变量/`.env` fallback 仍提供 token，界面和命令会明确提示退出尚未完成，需要移除外部 token 并重启。此时状态 API 返回 `credentialRemaining: true`，不会返回 token 本身。

### 使用已有 OAuth token

可以用长期 GitHub OAuth token 代替设备流登录：

```sh
export GITHUB_COPILOT_OAUTH_TOKEN='<your-github-oauth-token>'
dsh web
```

凭据服务就绪后，插件**仅在 grant 尚不存在时**将该 token 写入 grant。已有 grant 的优先级高于环境变量或凭据引用。在将环境变量引用视为只读的 Harness 版本中，沿用过程只写入 grant，不尝试覆盖环境变量。

应使用兼容 Copilot OAuth 流程取得的 token，而不是短期 Copilot API token。本插件不校验 token 前缀，也不保证任意 PAT 或 `gh auth login` 取得的 token 都有 Copilot 权限。

使用环境变量 token 时，如需退出登录，请先从启动环境移除该变量，在没有它的环境中重启 DSH，再执行 `/copilot-logout`。否则旧版 Harness 会拒绝清除只读引用；新版虽可删除文件中的覆盖值，仍会回退到环境变量 token。后续启动时还可能被重新沿用。

## 选择模型

登录只发布凭据，**不会**添加提供方配置。

1. 打开 **设置 → 模型**，注意这与本插件的登录页面不同。
2. 如果尚未配置，选择**添加提供方**，从内置目录选择 **`github-copilot`**。使用已保存的 grant 时，无需自定义 endpoint 或粘贴 API key。
3. 保存后重新打开聊天输入框的模型选择器，在 `github-copilot` 下选择模型。
4. 发起请求。Harness 路由会按需将长期 GitHub token 交换为短期 Copilot token、自动刷新，并推导账号对应的端点。

在已验证的 Harness 基线上，模型选择器来自路由的配置目录。打开选择器**不代表**已经按账号动态发现模型或验证认证成功；退出登录后，目录条目也可能仍然可见。插件既不会过滤这些条目，也不会补充下游目录中没有的模型。参见[模型列表跟踪问题](docs/issues/github-copilot-model-list-refresh.md)。

如果从旧适配器版本（截至 `0.4.5`）升级，请把设置和会话中已移除的 `github-copilot-official` 提供方改为 `github-copilot`，并选择当前目录中可用的模型。已有 token 引用会被自动沿用；只要 token 仍然有效，就无需再次登录。

## 配置

本插件无需配置即可使用。唯一选项 `oauthTokenEnv` 指定读取已有 token 的凭据引用/环境变量名，并在该引用可写时保存一份登录后的 token：

```yaml
- id: llm-github-copilot
  config:
    oauthTokenEnv: GITHUB_COPILOT_OAUTH_TOKEN
```

将这段**覆盖配置**写入活动 profile 的 `cordis.patch.yml`，不要再添加 `insert`。实时设置使用该 profile patch，不使用单独的 `settings.yaml` 设置段。

路由实际读取的 grant 始终位于 `llm-pi-ai/github-copilot`；修改 `oauthTokenEnv` 不会移动它，也不会创建第二个账号或提供方。模型、端点和请求行为均在 Harness 路由的 `llm-pi-ai` 条目下配置，不在本插件中。

## 开发

需要 Node.js ≥ 24 和 npm。在仓库根目录操作，修改 `src/host/` 和 `src/client/`，不要编辑生成的 `lib/` 文件。

```sh
npm ci
npm run build      # 合并源码分片 → lib/index.js 和 lib/client.js
npm test           # 测试生成产物、凭据交接、i18n、元数据和 README 契约
npm run check      # 构建 + 产物测试 + npm pack 演练（prepack 会执行完整测试集）
```

针对所支持 RC 版本运行打包安装和真实浏览器检查：

```sh
npx playwright install chromium
npm run test:harness -- 0.2.1-rc.2
npm run test:harness -- 0.2.1-rc.5
```

这些检查使用独立临时 `DSH_HOME`、合成 quota 账号凭据和模拟 GitHub 响应，并在 Chromium 中验证账号切换；不会使用你的凭据，也不会发起真实 Copilot 请求。CI 还覆盖 `0.2.0-rc.2` 和 `0.2.1-rc.3`，并以不阻塞的预览方式运行 `0.2.2-alpha.3`。测试选项以及分支、PR、发布规则见[开发工作流](docs/WORKFLOW.md)。

全部检查通过后，可选择部署到本地 Web profile：

```sh
npm run deploy     # 构建 → 产物测试 → 原子部署，保留回滚备份
```

该命令直接复制发布文件和运行时依赖，不执行 `npm install`，也不会替 profile 注册尚未存在的 bundle。首次安装当前 checkout 时，先构建，再执行：

```sh
dsh plugin --profile web add . -w
```

修改 Host 代码后需重启 DSH；仅修改 Client 代码时，硬刷新（`Ctrl+Shift+R`）通常就足够了。

## 回滚本地部署

`npm run deploy` 会将已有安装备份到 `${DSH_HOME:-$HOME/.dsh}/plugin-backups/dsh-llm-github-copilot/`，最多保留五份备份。目录名包含版本号和时间戳。

停止 DSH，选定备份后替换安装目录，不要将备份复制到一个已存在的插件目录内部：

```sh
PLUGIN="${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/@lujianjun19/dsh-llm-github-copilot"
BACKUP="${DSH_HOME:-$HOME/.dsh}/plugin-backups/dsh-llm-github-copilot/<backup-directory>"
# 执行以下命令前，先替换上面的 <backup-directory>。
test -d "$BACKUP" && mv "$PLUGIN" "${PLUGIN}.before-rollback-$(date +%Y%m%d%H%M%S)" && cp -a "$BACKUP" "$PLUGIN"
dsh web
```

这只恢复本地部署的包文件，不恢复 profile manifest 或 lockfile。对于 npm/GitHub 管理的安装，应改用 `dsh plugin --profile web add …@X.Y.Z -w` 安装目标版本。

## 常见问题

### 已登录，但没有 GitHub Copilot 模型

确认已在 **设置 → 模型** 中配置 `github-copilot`（见[选择模型](#选择模型)）。如果连插件设置页都没有，请检查安装版本和 bundle 注册，重启 DSH 并硬刷新。反复登录不会添加提供方。

### 缺少某个模型，或可见模型无法请求

检查 Harness 路由的目录/配置、账号及组织的模型策略，以及实际请求错误。选择器不是实时权限校验。本插件无法扩展目录，也不能将所有模型缺失都归因于 IP 限制。

### `/copilot-login` 报网络错误或一直等待

检查能否访问 GitHub。设备流请求读取 `https_proxy`/`HTTPS_PROXY`/`http_proxy`/`HTTP_PROXY`（HTTP(S) 代理 URL）以及按主机名匹配的 `no_proxy`/`NO_PROXY`。这只适用于本插件的设备流，不是 Harness 模型请求的代理配置。轮询会对临时失败持续重试，直到设备码过期。流程尚在等待时，重复执行 `/copilot-login` 会复用同一设备码；过期或拒绝后再重新发起登录。关闭对话框不会取消 Host 轮询。

### token 交换失败，或 token 已被吊销

`/copilot-status` 只检查 token 是否已保存。短期 Copilot token 由 Harness 路由刷新；长期 GitHub token 被吊销或不可用时，需要重新登录。先按上文移除环境变量 token，退出登录，再执行 `/copilot-login`。

账号切换的行为与安全处理见[切换已保存账号](#切换已保存账号)及 [English documentation](README.md#switch-saved-accounts)。

### 启动时报 `configurable provider "github-copilot" is already declared`

本插件不注册模型提供方。请检查重复的提供方配置、旧适配器注册，以及 bundle 之外遗留的手动插件 `insert`。本插件只保留一份 bundle 注册，内置提供方也只配置一次。

### 退出登录后模型仍出现在选择器中

删除凭据不会删除提供方配置。目录可见性和基于凭据的过滤属于 Harness 路由，见[跟踪问题](docs/issues/github-copilot-model-list-refresh.md)。

## 许可证

[MIT](LICENSE)
