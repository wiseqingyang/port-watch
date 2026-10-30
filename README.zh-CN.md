<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/public/brand/logo-dark.svg">
  <img src="frontend/public/brand/logo-light.svg" alt="PortWatch" width="440">
</picture>

# 谁又占了我的 3000？

**还有，上次让 Agent 做的 demo，跑在哪个端口来着？**

找到占用端口的服务，也找回还在运行的 demo。

[English](./README.md) · [简体中文](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/@wiseqingyang/port-watch?color=28785c&label=npm)](https://www.npmjs.com/package/@wiseqingyang/port-watch) [![MIT](https://img.shields.io/badge/license-MIT-edaa56)](./LICENSE)

[开始使用](#开始使用) · [看看能做什么](#让开着的项目一目了然) · [反馈想法](https://github.com/wiseqingyang/port-watch/issues)

</div>

PortWatch 就是为这两件小事做的。把本机正在运行的服务按项目摆在一起：搜 `3000`，看看是谁占着；找到熟悉的项目目录，点开端口链接，继续上次的 demo。

![PortWatch 深色目录视图：三个示例项目中的六个运行服务](docs/images/overview-zh.png)

<p align="center"><sub>实际界面，使用虚构项目数据。支持中文 / English、深色 / 浅色。</sub></p>

## 开始使用

在终端运行这一行，浏览器就会打开面板：

```sh
npx @wiseqingyang/port-watch@latest
```

需要 **macOS 或 Linux**，以及 [Node.js 22.12+](https://nodejs.org/)。暂不支持 Windows。

<details>
<summary>经常用？装成一个随手可用的命令</summary>

```sh
npm install --global @wiseqingyang/port-watch
port-watch
```

</details>

<details>
<summary>Linux 提示缺少工具 / 下载遇到问题</summary>

Debian / Ubuntu 安装扫描工具：

```sh
sudo apt install lsof procps
```

使用镜像源时，新版本可能还没同步。可以指定官方源：

```sh
npx --registry=https://registry.npmjs.org @wiseqingyang/port-watch@latest
```

</details>

如果在本项目源码目录里运行 `npx` 时提示 `sh: port-watch: command not found`，请像上面一样带上 `@latest`。省略它时，npm 可能选中当前同名项目，而不安装已发布的包；指定 registry 也不会改变这一点。运行本地源码请用 `pnpm build && pnpm start`。

## 让开着的项目一目了然

- **🔎 谁占了我的端口？** 输入 `3000`，查看对应的服务、项目目录和启动命令。
- **🗂️ 上次的 demo 在哪？** 搜项目名，或沿着目录找一找。只要服务还在运行，就能找到它的端口，点链接重新打开。
- **⏹️ 收拾不用的服务。** 点停止，确认后关闭选中的进程。需要强制停止时，会再让你确认一次。

## 换个视角，也换个心情

想直接扫一眼所有服务？切到平铺列表，按端口、内存或启动时间排序。右上角可以切换语言和深浅主题。

![PortWatch 浅色平铺列表：端口、项目目录和资源用量并排显示](docs/images/list-zh.png)

## 关之前，先看清楚

点开服务，看看它的目录、启动命令和资源占用。确认是自己要关的那个，再动手。

<p align="center">
  <img src="docs/images/detail-zh.png" alt="notes-web 示例服务详情：端口、内存、目录和停止按钮" width="600">
</p>

## 几个小提示

- 没看到预期的服务？关掉“开发/Agent”筛选，查看全部可见的 TCP 监听服务。
- 使用终端打印的完整链接；重启 PortWatch 后重新打开新链接。链接和截图里的私人信息不要随手分享。
- 停止只作用于选中的进程；子进程或自动拉起服务的工具可能仍在运行。
- 在自己的电脑上以普通用户运行。没有账号注册，也没有遥测。

---

<p align="center">
  <img src="frontend/public/brand/mark.svg" alt="PortWatch 小哨兵" width="56">
  <br>
  <b>给同时开着好几个项目的你。</b>
  <br>
  小工具，也欢迎你来添一笔。
</p>

<p align="center">
  <a href="https://github.com/wiseqingyang/port-watch/issues">提个想法 / 报个问题</a> ·
  <a href="./CONTRIBUTING.md">一起动手</a> ·
  <a href="./docs/reference.zh-CN.md">使用参考</a> ·
  <a href="./LICENSE">MIT</a>
</p>
