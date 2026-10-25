# SchwabTokenAutoRefresher

按计划刷新 Charles Schwab OAuth token，并写入 Google Cloud Secret Manager 的工具。

[English](README.md) | 简体中文

## 状态

实验性项目，使用风险自负。本项目不构成投资建议，也不保证任何交易结果。它代替其他服务管理券商凭据，配置错误会导致这些服务无法完成认证。它不提交订单。

## 简介

SchwabTokenAutoRefresher 按计划刷新 Charles Schwab OAuth token，并把刷新后的凭据写入 Google Cloud Secret Manager，让依赖它的服务无需人工续期即可持有有效 token。它用 Playwright 完成券商登录，包括 TOTP 双因素认证，并支持通过出站 HTTP 代理访问。运行环境为 Node.js 20。

## 不适用范围

它不提交、修改或撤销订单。它不决定哪些策略可以运行。它不是通用的密钥管理服务，也不替代消费该 token 的平台仓库。

## 快速开始

需要 Node.js 20.x 和 npm。

```bash
npm ci
```

刷新器从环境变量读取凭据，并且需要浏览器会话，因此在无显示环境下要像 `start` 脚本那样用 headless X server 运行：

```bash
npm start
```

单元测试是普通的 Node 脚本，不会访问券商：

```bash
node tests/test_auth_retry.js
node tests/test_proxy_config.js
node tests/test_auth_code_extraction.js
```

## 配置

| 变量 | 必填 | 默认值 | 用途 |
|---|---|---|---|
| `SCHWAB_USERNAME` | 是 | 无 | 券商登录名。 |
| `SCHWAB_PASSWORD` | 是 | 无 | 券商登录密码。 |
| `SCHWAB_TOTP_SECRET` | 是 | 无 | 生成 TOTP 验证码的 Base32 密钥。 |
| `SCHWAB_API_KEY` | 是 | 无 | OAuth 应用 key。 |
| `SCHWAB_APP_SECRET` | 是 | 无 | OAuth 应用 secret。 |
| `SCHWAB_REDIRECT_URI` | 是 | 无 | 在应用中登记的 OAuth 回调地址。 |
| `GCP_PROJECT_ID` | 是 | 无 | 存放密钥的 Google Cloud 项目。 |
| `GCP_SECRET_ID` | 是 | 无 | 要更新的 Secret Manager 密钥。 |
| `GCP_SA_KEY` | 否 | 环境默认凭据 | 无法使用环境默认凭据时提供的 service account key JSON。 |
| `GCP_SECRET_VERSION_RETENTION` | 否 | `1` | 保留的密钥版本数量；更早的版本会被永久销毁，无法恢复。 |
| `SCHWAB_PROXY_URL` | 否 | 无 | 登录流程使用的 HTTP 代理。 |
| `SCHWAB_FORCE_PROXY_FIRST` | 否 | 关闭 | 设为 `true` 时优先经代理连接，再尝试直连。 |

## 仓库结构

```
main.js     定时刷新入口
lib/        代理、OAuth 和重试辅助模块
tests/      单元测试（使用已安装的依赖）
prompts/    审阅提示词
scripts/    运维脚本
```

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。AI 助手与维护者遵循 [AGENTS.md](AGENTS.md)。

## 安全

见 [SECURITY.md](SECURITY.md)。安全漏洞不要开公开 issue，也不要把凭据或 token 提交到仓库。

## 许可证

MIT，见 [LICENSE](LICENSE)。
