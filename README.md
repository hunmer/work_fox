# WorkFox

> Workflow + AI Agent 桌面/Web 应用，基于 Electron + Vue 3 + Node.js Backend 构建，提供可视化工作流编排与 AI Agent 驱动的自动化能力。

## 功能特性

- **可视化工作流编辑器** — 基于 Vue Flow 的拖拽式 DAG 编辑器，支持复合节点、嵌入式子工作流、分组、便签
- **AI Agent 集成** — 通过 Claude Agent SDK 驱动流式对话，支持工具调用和 thinking blocks
- **插件系统** — 支持 server / client / Web CDN 三类插件扩展
- **多标签页** — 多工作流并行编辑，每个标签页独立维护工作流状态和 Chat 会话
- **Dashboard** — 统计概览、执行趋势图、执行历史、工作流详情
- **双模式运行** — Electron 桌面应用 + 纯浏览器 Web 模式

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Pinia + Vue Router + Tailwind CSS 4 |
| 画布 | Vue Flow |
| 后端 | Node.js + Express 5 + ws 8 |
| 桌面 | Electron 35 |
| 构建 | electron-vite 3 + Vite 6 |
| 类型 | TypeScript 5.7 strict |

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 10

### 安装

```bash
git clone https://github.com/hunmer/work_fox.git
cd work_fox
pnpm install
```

### 开发

```bash
# Electron 桌面模式
pnpm dev

# Web 浏览器模式（前端 + 后端独立启动）
pnpm dev:backend   # 终端 1：启动后端
pnpm dev:web       # 终端 2：启动前端开发服务器
```

### 构建

```bash
# 编译后端
pnpm build:backend

# 构建桌面应用
pnpm build

# 构建 Web 前端
pnpm build:web
```

---

## Docker 部署

WorkFox 支持通过 Docker 在服务器上运行 Web 模式，用户通过浏览器访问。

### 环境要求

- Docker >= 20
- Docker Compose >= 2.0

### 方式一：多容器部署（推荐生产环境）

Nginx 提供前端静态文件和反向代理，Backend 提供 API 和 WebSocket 服务。

```bash
# 构建并启动
docker compose up -d

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f
```

启动后访问 `http://localhost`。

架构：

```
浏览器 → Nginx (:80)
            ├── /           → 静态文件 (Vue SPA)
            ├── /assets/*   → 静态资源 (长期缓存)
            ├── /ws         → WebSocket 代理 → Backend (:9123)
            ├── /health     → 健康检查代理
            └── /hook/*     → Webhook 代理
```

### 方式二：单容器部署（简化）

Backend 通过 Express 直接提供前端静态文件，无需 Nginx。

```bash
# 构建并启动
docker compose -f docker-compose.standalone.yml up -d
```

启动后访问 `http://localhost:9123`。

### 配置

通过环境变量或 `.env` 文件配置：

```bash
# 复制模板
cp .env.example .env

# 编辑配置
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WORKFOX_LOG_LEVEL` | `info` | 日志级别：debug / info / warn / error |
| `WORKFOX_BACKEND_TOKEN` | （空） | WebSocket 认证 token，建议设置 |
| `WORKFOX_HOOK_SECRET` | （空） | Webhook 请求验证密钥 |
| `WORKFOX_WEB_PORT` | `80` | 多容器模式：Web 界面端口 |
| `WORKFOX_PORT` | `9123` | 单容器模式：服务端口 |

### 数据持久化

所有用户数据（工作流、执行日志、AI Provider 配置、Chat 历史等）存储在 Docker 命名卷 `workfox-data` 中，容器重启不丢失。

```bash
# 查看卷位置
docker volume inspect work_fox_workfox-data

# 备份数据
docker run --rm -v work_fox_workfox-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/workfox-backup.tar.gz -C /data .

# 恢复数据
docker run --rm -v work_fox_workfox-data:/data -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/workfox-backup.tar.gz"
```

### 常用命令

```bash
# 启动
docker compose up -d

# 停止
docker compose down

# 停止并删除数据卷（清除所有数据）
docker compose down -v

# 重新构建（代码更新后）
docker compose up -d --build

# 查看后端日志
docker compose logs -f backend

# 健康检查
curl http://localhost/health
```

### HTTPS 配置

生产环境建议在前面再加一层反向代理（如 Caddy、Traefik）来处理 TLS：

**Caddy 示例**（`Caddyfile`）：

```
workfox.example.com {
    reverse_proxy localhost:80
}
```

**Traefik 示例**（`docker-compose.yml` labels）：

```yaml
services:
  web:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.workfox.rule=Host(`workfox.example.com`)"
      - "traefik.http.services.workfox.loadbalancer.server.port=80"
```

### 自定义 Nginx 端口

```bash
# 使用 8080 端口
WORKFOX_WEB_PORT=8080 docker compose up -d
```

或在 `.env` 文件中设置：

```
WORKFOX_WEB_PORT=8080
```

---

## 项目结构

```
├── src/                    渲染进程（Vue 3 SPA）
│   ├── views/              页面组件
│   ├── components/         业务组件
│   ├── stores/             Pinia 状态管理
│   ├── lib/                核心逻辑（agent / workflow / backend-api）
│   └── web/                Web 模式入口
├── electron/               Electron 主进程
│   ├── ipc/                IPC handlers
│   └── services/           核心服务
├── backend/                Backend 服务（Node.js）
│   ├── app/                配置 / 日志 / 服务器
│   ├── ws/                 WebSocket 路由和通道
│   ├── workflow/           执行管理 / 交互管理
│   ├── storage/            JSON 文件存储
│   ├── chat/               Chat 运行时 / 工具适配
│   └── plugins/            插件注册表
├── shared/                 前后端共享协议和类型
├── resources/plugins/      内置插件
├── Dockerfile              多阶段 Docker 构建
├── docker-compose.yml      多容器编排
└── docker-compose.standalone.yml  单容器编排
```

## License

MIT
