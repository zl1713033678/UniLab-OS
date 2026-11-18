# ADR-0002：内网单端口前后端一体化静态托管方案

- **状态**：已采纳（Accepted）
- **日期**：2026-11-11
- **关联代码**：`backend/main.py`, `deploy_intranet.ps1`, `frontend/vite.config.js`

## 1. 背景与问题（Context）
院所局域网演示与内网试运行环境通常受防火墙和端口策略限制，若长期要求同时开放 `5173`（前端）与 `8000`（后端）双端口，配置繁琐且易出现跨域问题。

## 2. 核心决策（Decision）
1. 前端 `API_BASE` 默认取相对路径 `import.meta.env.VITE_API_BASE ?? ''`，开发模式通过 `vite.config.js` 代理 `/api` 与 `/ws` 到 `127.0.0.1:8000`。
2. 生产/内网模式通过 `deploy_intranet.ps1` 执行 `npm run build` 生成 `frontend/dist`，由 `backend/main.py` 检测 `frontend/dist/index.html` 后自动挂载 `/assets` 与根路由 `/`，统一由 `uvicorn` 在 `0.0.0.0:8000` 单端口对外服务。

## 3. 后果与权衡（Consequences）
- **收益**：仅需放行一条 `8000` TCP 入站规则即可同时访问 Web 界面、API 文档与 `/api/v1/ext/*` 硬件网关，无 CORS 跨域摩擦。
- **代价与约束**：每次修改前端源码后，单端口部署前必须重新执行 `npm run build`（或运行 `deploy_intranet.ps1`）更新 `frontend/dist`。
