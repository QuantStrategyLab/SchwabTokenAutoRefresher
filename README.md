# Schwab Token Auto Refresher

> ⚠️ 投资有风险，不构成投资建议，仅供学习交流用途。

[English](#english) | [中文](#中文)

---

<a id="english"></a>
## English

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Stealth-orange.svg)](https://playwright.dev/)

An automated utility designed to bypass the 7-day expiration of Charles Schwab API Refresh Tokens. It leverages GitHub-hosted runners (`ubuntu-latest`) with 7GB RAM to run an official Google Chrome instance, automating the OAuth consent flow and synchronizing credentials directly to Google Cloud Secret Manager.

## 🚀 Features

- **GitHub-Hosted Efficiency**: Runs entirely on GitHub's infrastructure (7GB RAM), eliminating the need for private VPS maintenance.
- **Official Chrome Integration**: Dynamically installs the retail version of Google Chrome (.deb) to ensure maximum browser trust and bypass bot detection.
- **Stealth-Mode Automation**: Powered by `playwright-extra` and `stealth` plugins to emulate human-like behavior and bypass sophisticated anti-bot challenges.
- **Automated Virtual Display**: Uses `xvfb-run` within the CI environment to handle headed browser interactions without a physical monitor.
- **Secure Cloud Sync**: Injects refreshed tokens directly into Google Cloud Secret Manager via memory, ensuring no sensitive data is stored in the repo.
- **Isolated Logging**: Success timestamps are automatically committed to a dedicated `logs` branch to keep the main commit history clean.

## 🛠 Setup & Installation

If you have forked this repository, follow these steps to enable the automation:

### 1. Configure GitHub Secrets
Go to **Settings > Secrets and variables > Actions** in your repo and add:

| Secret Name | Description |
| :--- | :--- |
| `SCHWAB_USERNAME` | Your Schwab account Login ID |
| `SCHWAB_PASSWORD` | Your Schwab account Password |
| `SCHWAB_TOTP_SECRET` | Your 2FA/MFA secret key (Base32) |
| `SCHWAB_API_KEY` | Your Schwab Developer App Client ID |
| `SCHWAB_APP_SECRET` | Your Schwab Developer App Client Secret |
| `GCP_SA_KEY` | JSON key for a GCP Service Account with Secret Manager permissions |
| `SCHWAB_PROXY_URL` | Optional authenticated HTTP/HTTPS proxy URL for routing Schwab browser/API traffic through your home/residential exit, e.g. `http://user:pass@proxy.example.com:3128` |

These values are better stored as **GitHub Variables** because they are configuration, not credentials:

| Variable Name | Description |
| :--- | :--- |
| `GCP_PROJECT_ID` | Your Google Cloud Project ID |
| `GCP_SECRET_ID` | The name of the secret in Secret Manager |
| `SCHWAB_REDIRECT_URI` | Your app's registered redirect URI |

### 2. Enable the Workflow
1. Navigate to the **Actions** tab of your repository.
2. Select **Schwab Token Auto Refresher** from the left sidebar.
3. Click **Enable workflow** (GitHub disables scheduled workflows on forks by default).
4. (Optional) Manually trigger the flow using **Run workflow** to verify the configuration.

### 3. Optional: Route Schwab traffic through your router/home exit IP

If Schwab is more reliable from your residential network than from GitHub-hosted IP ranges, this repo can route the **Schwab browser flow + token exchange request** through an authenticated proxy by setting `SCHWAB_PROXY_URL`.

This behavior is **default-off**:

- if `SCHWAB_PROXY_URL` is not configured, the workflow does **not** use a proxy
- if `SCHWAB_PROXY_URL` is configured, the workflow uses that proxy for Schwab traffic

Important boundary:

- Your **router public IP is not a proxy by itself**.
- Do **not** expose the OpenWrt/LuCI admin UI to the public internet.
- You need a separate **HTTP/HTTPS proxy service** reachable from GitHub Actions, then point `SCHWAB_PROXY_URL` at that endpoint.

Typical setup options:

1. Run a small authenticated proxy inside your home network (for example on the router or a LAN machine).
2. Expose only that proxy through your preferred tunnel/reverse-proxy setup.
3. Store the final public endpoint in `SCHWAB_PROXY_URL`, for example:

   ```text
   SCHWAB_PROXY_URL=http://user:pass@proxy.example.com:3128
   ```

Notes:

- This repo currently supports **HTTP/HTTPS proxy URLs** for workflow mode.
- If `SCHWAB_PROXY_URL` is absent, the workflow runs without the home-exit proxy.
- Only the Schwab automation traffic is proxied. Package installation and GitHub/GCP housekeeping continue to use the runner's default egress.
- If you want every step to originate from home, a **self-hosted runner in your LAN** is usually simpler and more stable than tunneling a proxy into a GitHub-hosted runner.

## 📈 Architecture

1. **Trigger**: Triggered by GitHub Actions scheduler every 3 days at 13:00 UTC.
2. **Environment**: Spin up an `ubuntu-latest` runner, install Google Chrome stable, and initialize a virtual display via `xvfb`.
3. **Execution**: Playwright-stealth navigates the OAuth flow, inputs credentials, generates TOTP, and intercepts the redirect code.
4. **Synchronization**: The utility exchanges the code for tokens and updates GCP Secret Manager.
5. **Logging**: Updates `last_run.txt` on the `logs` branch to confirm a successful refresh.

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.

---

<a id="中文"></a>
## 中文

用于自动刷新 Charles Schwab API refresh token 的工具。它在 GitHub-hosted runner（`ubuntu-latest`）上运行官方 Google Chrome，自动完成 OAuth consent flow，并把刷新后的凭据同步到 Google Cloud Secret Manager。

## 功能

- **GitHub-hosted 运行**：直接使用 GitHub runner，不需要维护私有 VPS。
- **官方 Chrome**：动态安装 retail Google Chrome `.deb`，提高浏览器兼容性。
- **Stealth 自动化**：通过 `playwright-extra` 和 stealth 插件模拟正常浏览器行为。
- **虚拟显示**：在 CI 中使用 `xvfb-run` 支持 headed browser 交互。
- **安全同步**：刷新后的 token 直接写入 Google Cloud Secret Manager，不写入仓库。
- **隔离日志**：成功时间戳提交到独立 `logs` 分支，避免污染主分支历史。

## 设置

如果你 fork 了这个仓库，需要在 **Settings > Secrets and variables > Actions** 中配置：

| Secret Name | 说明 |
| :--- | :--- |
| `SCHWAB_USERNAME` | Schwab 登录 ID |
| `SCHWAB_PASSWORD` | Schwab 登录密码 |
| `SCHWAB_TOTP_SECRET` | 2FA/MFA Base32 secret |
| `SCHWAB_API_KEY` | Schwab Developer App Client ID |
| `SCHWAB_APP_SECRET` | Schwab Developer App Client Secret |
| `GCP_SA_KEY` | 具备 Secret Manager 权限的 GCP Service Account JSON key |
| `SCHWAB_PROXY_URL` | 可选的认证 HTTP/HTTPS 代理 URL，用于让 Schwab 浏览器/API 流量走住宅或家庭出口 |

这些值属于配置而非凭据，更适合放在 **GitHub Variables**：

| Variable Name | 说明 |
| :--- | :--- |
| `GCP_PROJECT_ID` | Google Cloud Project ID |
| `GCP_SECRET_ID` | Secret Manager 中的 secret 名称 |
| `SCHWAB_REDIRECT_URI` | Schwab app 注册的 redirect URI |

## 启用 workflow

1. 打开仓库的 **Actions** tab。
2. 选择 **Schwab Token Auto Refresher**。
3. 点击 **Enable workflow**。
4. 可选：用 **Run workflow** 手工触发一次，验证配置。

## 可选代理

如果 Schwab 从住宅网络访问更稳定，可以配置 `SCHWAB_PROXY_URL`，让 Schwab 浏览器流程和 token exchange 请求走认证代理。默认情况下不使用代理。

注意：

- 路由器公网 IP 本身不是代理。
- 不要把 OpenWrt/LuCI 管理界面暴露到公网。
- 需要单独部署一个 GitHub Actions 可访问的 HTTP/HTTPS proxy service。
- 只有 Schwab 自动化流量走代理；依赖安装、GitHub 和 GCP 操作仍走 runner 默认出口。

## 架构

1. GitHub Actions schedule 每 3 天触发一次。
2. Runner 安装 Google Chrome stable，并初始化 `xvfb` 虚拟显示。
3. Playwright-stealth 完成 OAuth 流程、输入凭据、生成 TOTP，并截获 redirect code。
4. 工具用 code 换取 token，并更新 GCP Secret Manager。
5. 成功时间戳写入 `logs` 分支。

## 许可证

本项目使用 MIT License。详见 `LICENSE`。
