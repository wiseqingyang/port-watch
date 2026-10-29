<div align="center">

# PortWatch

**面向多项目开发的本地 TCP 服务管理面板。**

[English](./README.md) · [简体中文](./README.zh-CN.md) · [贡献指南](./CONTRIBUTING.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12.0-339933.svg)](https://nodejs.org/)

</div>

PortWatch 将可见的 TCP 监听进程按项目目录组织起来，提供目录树和平铺视图、框架分类、端口搜索、资源指标、目录定位，以及需要确认的进程停止操作。

## 环境要求

- **macOS 或 Linux**，Node.js **22.12.0 及以上**；不支持 Windows。
- `PATH` 中存在 `lsof` 和 `ps`。macOS 通常自带；Debian/Ubuntu 可执行 `sudo apt install lsof procps`。
- 打开浏览器和目录需要图形桌面。Linux 目录定位使用 `xdg-open`，通常由 `xdg-utils` 提供。
- 源码开发使用 **pnpm 9.14.4**，已在 `packageManager` 中声明。

请以普通用户运行 PortWatch，不要使用 `sudo`。面板不能停止 root 或其他用户拥有的进程。

## 快速开始

使用 npm 直接运行：

```sh
npx @wiseqingyang/port-watch
# 或
npm install --global @wiseqingyang/port-watch
port-watch
```

从源码构建：

```sh
git clone https://github.com/wiseqingyang/port-watch.git
cd port-watch
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

注册为全局命令：

```sh
pnpm link --global
port-watch
```

启动后会输出并默认打开**本次会话的私有链接**。请使用完整链接，不要分享其中的令牌。浏览器读取令牌后会移除地址栏中的 fragment，将令牌保存在当前标签页的 session storage 中。PortWatch 每次重启都会生成新令牌，需要重新打开新的链接。

## 功能与边界

- 目录树、平铺视图、搜索、排序、深浅主题与中英文界面。
- 基于规则识别常见 Web 框架、数据库、开发工具和 AI 服务。分类用于辅助展示，不参与安全权限决策。
- 从进程工作目录向上最多检查 12 层，识别 `package.json`、`.git`、`go.mod`、`Cargo.toml`、`pyproject.toml`、`pom.xml`、`build.gradle`、`build.gradle.kts` 和 `requirements.txt`。
- 展示 CPU、内存、所属用户、运行时长、端口、工作目录，以及对常见凭据模式进行脱敏后的命令行。
- **停止进程**先发送 `SIGTERM`。如果进程仍在运行，可以等待并刷新，或通过第二次确认执行**强制停止**（`SIGKILL`）；不会自动升级信号。
- 仅停止选中的进程，不关闭其子进程或整个进程组。监督程序可能重新拉起服务，其他进程可能继续占用同一端口。
- **暂不提供自动重启。** 系统进程列表无法可靠还原原始参数边界、环境变量和监督程序配置。复制出来的展示命令也不保证可用于重启。
- 仅扫描当前用户可见的 TCP 监听进程，不包括 UDP、未监听端口的进程，以及仅使用 stdio 的 MCP 服务。部分信息可能受系统权限限制。

页面隐藏时暂停自动刷新；并发读取共享短时间扫描结果，系统工具执行有超时限制。这些措施用于减少重复工作，不作“零耗电”或休眠行为保证。

## 命令行参数

```text
port-watch [options]

-V, --version        查看版本
-p, --port <number>  面板端口，1–65535（默认 4999）
--host <address>     127.0.0.1 或 ::1（默认 127.0.0.1）
-l, --lang <locale>  zh 或 en（未指定时跟随浏览器偏好）
--no-open            只输出会话链接，不自动打开浏览器
--dev                使用本地 Vite 面板，仅用于源码开发
-h, --help           查看帮助
```

端口被占用时，在合法范围内最多向后尝试 100 个端口。开发模式固定使用 API 端口 4999 和前端端口 5175，占用时明确报错。拒绝绑定非回环地址。

## 安全与隐私

全部 API（包括健康检查）要求本次启动的会话令牌，同时检查 Host 和 Origin，不启用通配 CORS。不要通过反向代理、隧道或共享系统账户暴露本工具；它不是远程管理服务。

PortWatch 读取本地进程和项目元数据，没有主动上传这些数据的逻辑或遥测功能。面板会显示用户名、主机名、路径、项目名和命令参数。凭据脱敏只是**尽力识别**，分享截图和复制内容前仍需检查。安装 npm 依赖、访问外部链接属于另外的网络活动。

后端统一执行进程保护，并在停止前核对 PID、所属用户和启动时间。这能减少陈旧列表导致的误操作，但无法消除检查与发送 POSIX 信号之间很小的系统竞争窗口。

## 本地开发

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开**后端**输出的 `http://127.0.0.1:5175/…#token=…` 完整链接，不要只使用 Vite 输出的裸地址。Vite 将 `/api` 代理至 `127.0.0.1:4999`，令牌不会写入前端源文件；后端重启后需使用新的会话链接。

```sh
pnpm typecheck       # 后端、测试、前端和 Vite 配置的类型检查
pnpm lint
pnpm test            # 单元测试与隔离的系统/API 回归测试
pnpm test:package    # 构建、打包、临时安装并验证真实 CLI
pnpm check          # 执行以上全部检查
```

安装包测试会访问官方 npm registry，完成后清理临时安装。测试仅对专门创建的测试进程发送信号，不操作已有业务服务。CI 配置覆盖 macOS/Linux、Node 22.12.0 和 Node 24。

## 本地 API

所有请求都必须携带 `Authorization: Bearer <session-token>`，令牌取自当前 CLI 会话，不应硬编码。修改接口接受 JSON，拒绝压缩请求体。

| 方法 | 路径 | 请求或结果 |
| --- | --- | --- |
| GET | `/api/health` | 需要认证的存活检查 |
| GET | `/api/services` | TCP 服务与概览，命令行在传输前脱敏 |
| POST | `/api/services/kill` | `{ "serviceId": "<最新扫描中的 id>", "force": false }` |
| POST | `/api/services/reveal` | `{ "targetPath": "/absolute/path" }`；只允许当前服务目录树中的目录 |

服务 ID 绑定 PID 与所属用户、启动时间指纹，不接受任意 PID 操作。没有重启和批量关闭接口。停止结果的 `code` 为 `STOPPED`、`ALREADY_EXITED` 或 `STILL_RUNNING`；最后一种情况下 `success: false`。错误通过 HTTP 错误状态和 `{ "code", "error" }` 返回。

## 常见问题

- **会话失效或未授权：**重新打开当前终端中输出的完整链接，每次重启都会更换令牌。
- **工具缺失或扫描失败：**安装 `lsof`、`ps` 并检查普通用户权限。扫描失败会显示错误，不会伪装成“没有服务”。
- **停止后仍在运行：**进程可能退出较慢、忽略 SIGTERM，或被监督程序重建。先刷新检查，再决定是否强制停止。
- **端口仍被占用：**可能有共享监听者或子进程。停止一个 PID 不等于释放整个端口。
- **无法打开目录：**检查目录是否存在，以及图形文件管理器是否可用。
- **浏览器未自动打开：**使用 `--no-open`，在同一机器上手动打开输出的链接。

普通问题请提交至 [GitHub Issues](https://github.com/wiseqingyang/port-watch/issues)，附上已脱敏的复现信息。

## 许可证

[MIT](./LICENSE)。
