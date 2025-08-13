# GetNote - AI语音笔记插件

![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![AI Powered](https://img.shields.io/badge/AI-Powered-green)

GetNote是一款为Obsidian设计的AI语音笔记插件，使用阿里云百炼的qwen-audio-turbo模型，将语音录制转换为结构化的Markdown笔记。

## 🎯 主要功能

- **🎙️ 一键录音**: 工具栏按钮快速开始/停止录音
- **🤖 AI理解**: 使用阿里云百炼语音理解模型处理音频
- **📝 智能整理**: 自动生成结构化的Markdown笔记
- **📁 自动保存**: 笔记自动保存到指定文件夹
- **⚙️ 丰富设置**: 可自定义录音质量、提示词、模板等
- **📊 元数据**: 包含录音时长、处理时间等详细信息

## 🚀 快速开始

### 安装要求

1. Obsidian 版本 >= 0.15.0
2. 阿里云DashScope API Key ([获取方法](https://dashscope.aliyun.com/))
3. 支持Web Audio API的现代浏览器

### 安装方法

1. 下载最新版本的插件文件
2. 将文件放置到 `.obsidian/plugins/getnote-plugin/` 目录
3. 在Obsidian设置中启用"GetNote"插件
4. 配置API Key和相关设置

## 📋 使用方法

### 基础使用

1. **配置API Key**
   - 进入插件设置页面
   - 输入您的阿里云DashScope API Key
   - 点击"测试连接"确认配置正确

2. **开始录音**
   - 点击工具栏的🎙️图标
   - 或使用命令面板搜索"开始语音录制"
   - 允许麦克风权限

3. **停止录音**
   - 再次点击工具栏图标
   - 或使用命令"停止语音录制"
   - 系统将自动处理音频并生成笔记

4. **查看笔记**
   - 笔记自动保存到GetNote文件夹
   - 包含时间戳、元数据和AI处理的内容

### 高级功能

- **自定义提示词**: 控制AI生成笔记的格式和风格
- **模板选择**: 选择适合的笔记模板（会议、创意、待办等）
- **音频质量**: 根据需要调整录音质量
- **元数据控制**: 选择是否包含录音信息

## ⚙️ 设置选项

### API设置
- **API Key**: 阿里云DashScope API密钥
- **模型名称**: 使用的AI模型（默认：qwen-audio-turbo-latest）

### 录音设置
- **音频质量**: 低/中/高质量选择
- **最大录音时长**: 单次录音时长限制（30-1800秒）

### 输出设置
- **输出文件夹**: 笔记保存位置
- **自动保存**: 是否自动保存生成的笔记
- **包含时间戳**: 是否在笔记中显示时间信息
- **包含元数据**: 是否显示录音详细信息

### 模板设置
- **笔记模板**: 选择预设模板类型
- **AI提示词**: 自定义AI处理提示

## 🎨 笔记格式

生成的笔记包含以下结构：

```markdown
# 语音笔记标题

## 📝 笔记信息
- **创建时间**: 2024-01-01 12:00:00
- **录音时长**: 2分30秒
- **音频大小**: 1.2 MB
- **处理时长**: 3秒
- **AI模型**: qwen-audio-turbo-latest

---

## 📄 笔记内容
[AI生成的结构化内容]

## 🏷️ 标签
#语音笔记 #AI生成

---
*由 GetNote 插件自动生成*
```

## 🔧 开发信息

### 技术栈
- **TypeScript**: 主要开发语言
- **Obsidian API**: 插件框架
- **Web Audio API**: 录音功能
- **DashScope API**: AI语音理解

### 项目结构
```
├── main.ts              # 插件主类
├── src/
│   ├── recorder.ts      # 录音功能模块
│   ├── api-client.ts    # DashScope API客户端
│   ├── note-generator.ts # 笔记生成器
│   └── settings.ts      # 设置页面
├── manifest.json        # 插件元数据
└── package.json         # 依赖配置
```

### 构建命令
```bash
npm install              # 安装依赖
npm run dev              # 开发模式构建
npm run build            # 生产模式构建
```

## 🚨 注意事项

1. **API配额**: 使用阿里云API会产生费用，请注意配额使用
2. **网络要求**: 需要稳定的网络连接调用API
3. **隐私保护**: 音频数据会发送到阿里云服务器处理
4. **浏览器兼容**: 需要支持MediaRecorder API的现代浏览器
5. **文件大小**: 音频文件大小限制为10MB

## 📞 支持与反馈

- 如遇到问题，请检查网络连接和API Key配置
- 确保麦克风权限已正确授予
- 查看Obsidian开发者工具的控制台获取详细错误信息

## 📄 许可证

MIT License

## 🔮 未来计划

- [ ] 支持更多AI模型
- [ ] 离线语音识别功能
- [ ] 批量音频处理
- [ ] 语音笔记搜索功能
- [ ] 多语言支持

---

**GetNote - 让语音变成知识** 🎤➡️📝