# 狗子 · 让正确的行为变得极其容易

> 一个 AI Native 的桌面应用 — 你跟 AI 说一句"刚花了 35 块吃午饭"，它就帮你记好了。
> 数据本地加密，Mac 原生。

这个仓库放着「狗子」的**对外站点**和**版本分发**。

- 官网：<https://gouzi.xiangyagu.com/>
- 最新版下载：[Releases](https://github.com/AllenCHM/gouzi/releases/latest)
- 邮件联系：<chinaxnccm@gmail.com>

---

## 狗子是什么

狗子最早叫"人生清单"。它的目标只有一个 ——

**让"该做的事"和"做了的事"，留下记录。**

围绕这个目标，狗子提供：

| 模块 | 用来做什么 |
|---|---|
| OKR | 写下年/季度目标，每周追进度 |
| 任务池 | 收件箱 + 四象限分诊，配合周计划锁定时间 |
| 周计划 / 今日清单 | 一周做什么、今天做什么，写完一句话回顾 |
| 财务账本 | 跟 AI 一句话记账，自带预算、报销、跑道分析 |
| 原则 | 自己写下原则、记录违背与对齐的案例 |
| AI Skill (`rzb`) | 任意 AI Agent（Claude Code / Codex / OpenCode / Hermes 等）都能直接读写你的数据 |

狗子默认你身边有 AI 助手。你说话，狗子默默记下来。

---

## 数据主权

狗子全程本地：

- **SQLite + SQLCipher** 加密落盘（设密码后 AES-256 + PBKDF2 100,000 次迭代）
- 数据在 `~/Library/Application Support/com.renshengzhangben.app/`，**不联网、不上报、不收集**
- 想换电脑？设置页 → 数据备份与恢复 → 导出到外部 → 拷贝到新机器 → 导入

> 我们的立场是：AI 是助手，不是房东。
> 用上 AI 的智能，但数据所有权留在你手里。

---

## 安装

### macOS（Apple Silicon）

1. 到 [Releases](https://github.com/AllenCHM/gouzi/releases/latest) 下载最新的 `.dmg`
2. 拖入 Applications
3. 首次启动时引导你设置一个密码（可跳过）
4. 设了密码 = 数据本地加密，离开你的 mac 就读不到

### Intel / Windows / Linux

正在路上。本仓库 Issue 区欢迎反馈优先级。

---

## 仓库结构

```
.
├── index.html        # 官网首页（GitHub Pages 直接部署）
├── assets/           # 图片、Logo、二维码
├── .nojekyll         # 告诉 Pages 不走 Jekyll
└── README.md         # 你正在看的文件
```

代码源（APP 本体）在另外的私有仓库；这个仓库只承担「下载入口 + 介绍页」两件事。

---

## 反馈与联系

- bug / 想要新功能 → [开 Issue](https://github.com/AllenCHM/gouzi/issues/new)
- 邮件：<chinaxnccm@gmail.com>
- 微信：在 APP「设置 → 反馈 · 联系作者」里有二维码

早期用户的反馈最值钱。

---

## License

待定。当前版本仅供个人非商业试用。商业授权请邮件联系。
