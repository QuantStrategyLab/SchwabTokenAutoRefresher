# SchwabTokenAutoRefresher


## QSL 架构角色

- **层级**：`平台工具`。
- **职责**：Schwab OAuth token refresh 自动化工具。
- **事实源/归属**：token refresh flow 和 Secret Manager sync 行为。
- **消费对象**：Schwab auth endpoints、Google Secret Manager、CharlesSchwabPlatform。
- **禁止事项**：决定策略 eligibility 或记录敏感 token 值。

[English README](README.md)

> 投资有风险。本项目不构成投资建议，仅用于学习、研究和工程审阅。

## 这个仓库是什么

SchwabTokenAutoRefresher 是 QuantStrategyLab 的凭据自动化工具。自动刷新 Schwab OAuth token，并把刷新后的凭据同步到 Google Cloud Secret Manager。

它支撑系统运行，但不决定哪个策略应该 live。策略资格由策略仓和 snapshot 仓负责；券商执行由平台仓负责。

## 设计边界

- 下游仓库依赖的契约要保持稳定，必要时做版本化。
- 除非有协同迁移计划，否则优先保持向后兼容。
- 密钥和环境专属配置不要写进共享库代码。
- 会影响多个平台或策略包的改动，需要在文档中说明。

## 仓库结构

- `tests/`：单元测试、契约测试和回归测试。
- `.github/workflows/`：CI、定时任务、发布或部署 workflow。

## 快速开始

```bash
npm ci
```

## 延伸文档

- 暂无独立 `docs/` 目录；请先阅读本 README 和 workflow 文件。

## 社区和安全

- 贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，确认 PR 范围、本地校验和文档要求。
- 讨论、issue 和 review 请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
- 涉及密钥、自动化、券商/交易所或云资源的漏洞请按 [SECURITY.md](SECURITY.md) 私密报告；不要为 secret 或实盘风险开公开 issue。

## 许可证

详见 [LICENSE](LICENSE)。
