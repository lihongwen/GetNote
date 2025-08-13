import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import GetNotePlugin from '../main';
import { DashScopeClient } from './api-client';

export interface GetNoteSettings {
    apiKey: string;
    modelName: string;
    outputFolder: string;
    audioQuality: 'low' | 'medium' | 'high';
    maxRecordingDuration: number; // 秒
    autoSave: boolean;
    includeTimestamp: boolean;
    includeMetadata: boolean;
    promptTemplate: string;
    noteTemplate: 'meeting' | 'idea' | 'todo' | 'general';
}

export const DEFAULT_SETTINGS: GetNoteSettings = {
    apiKey: '',
    modelName: 'qwen-audio-turbo-latest',
    outputFolder: 'GetNote',
    audioQuality: 'medium',
    maxRecordingDuration: 300, // 5分钟
    autoSave: true,
    includeTimestamp: true,
    includeMetadata: true,
    promptTemplate: '请将这段音频内容整理成结构化的笔记格式，包含标题、要点和详细说明。使用Markdown格式。',
    noteTemplate: 'general'
};

export class GetNoteSettingTab extends PluginSettingTab {
    plugin: GetNotePlugin;
    private apiTestResult: HTMLElement | null = null;

    constructor(app: App, plugin: GetNotePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'GetNote 插件设置' });

        // API设置部分
        this.createApiSettings(containerEl);

        // 录音设置部分  
        this.createRecordingSettings(containerEl);

        // 输出设置部分
        this.createOutputSettings(containerEl);

        // 模板设置部分
        this.createTemplateSettings(containerEl);

        // 高级设置部分
        this.createAdvancedSettings(containerEl);
    }

    private createApiSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '🔑 API 设置' });

        new Setting(containerEl)
            .setName('阿里云API Key')
            .setDesc('请输入您的阿里云DashScope API Key')
            .addText(text => text
                .setPlaceholder('sk-xxxxxxxxxxxxxxxxxxxxxxxx')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                    // 清除之前的测试结果
                    if (this.apiTestResult) {
                        this.apiTestResult.empty();
                    }
                }));

        new Setting(containerEl)
            .setName('模型名称')
            .setDesc('使用的语音理解模型')
            .addDropdown(dropdown => dropdown
                .addOption('qwen-audio-turbo-latest', 'Qwen Audio Turbo Latest')
                .addOption('qwen-audio-turbo', 'Qwen Audio Turbo')
                .setValue(this.plugin.settings.modelName)
                .onChange(async (value) => {
                    this.plugin.settings.modelName = value;
                    await this.plugin.saveSettings();
                }));

        // API测试按钮
        const apiTestSetting = new Setting(containerEl)
            .setName('API 连接测试')
            .setDesc('测试API Key是否有效')
            .addButton(button => button
                .setButtonText('测试连接')
                .setCta()
                .onClick(async () => {
                    await this.testApiConnection(button.buttonEl);
                }));

        // 测试结果显示区域
        this.apiTestResult = apiTestSetting.settingEl.createDiv('api-test-result');
    }

    private createRecordingSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '🎙️ 录音设置' });

        new Setting(containerEl)
            .setName('音频质量')
            .setDesc('录音的音频质量设置')
            .addDropdown(dropdown => dropdown
                .addOption('low', '低质量 (节省空间)')
                .addOption('medium', '中等质量 (推荐)')
                .addOption('high', '高质量 (最佳效果)')
                .setValue(this.plugin.settings.audioQuality)
                .onChange(async (value: 'low' | 'medium' | 'high') => {
                    this.plugin.settings.audioQuality = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('最大录音时长')
            .setDesc('单次录音的最大时长限制（秒）')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(this.plugin.settings.maxRecordingDuration.toString())
                .onChange(async (value) => {
                    const duration = parseInt(value) || 300;
                    this.plugin.settings.maxRecordingDuration = Math.max(30, Math.min(1800, duration));
                    await this.plugin.saveSettings();
                }));
    }

    private createOutputSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '📁 输出设置' });

        new Setting(containerEl)
            .setName('输出文件夹')
            .setDesc('语音笔记保存的文件夹名称')
            .addText(text => text
                .setPlaceholder('GetNote')
                .setValue(this.plugin.settings.outputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.outputFolder = value || 'GetNote';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('自动保存')
            .setDesc('录音结束后自动保存笔记')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSave)
                .onChange(async (value) => {
                    this.plugin.settings.autoSave = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('包含时间戳')
            .setDesc('在笔记中包含创建时间')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeTimestamp)
                .onChange(async (value) => {
                    this.plugin.settings.includeTimestamp = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('包含元数据')
            .setDesc('在笔记中包含录音信息等元数据')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeMetadata)
                .onChange(async (value) => {
                    this.plugin.settings.includeMetadata = value;
                    await this.plugin.saveSettings();
                }));
    }

    private createTemplateSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '📝 模板设置' });

        new Setting(containerEl)
            .setName('笔记模板')
            .setDesc('选择笔记的默认模板类型')
            .addDropdown(dropdown => dropdown
                .addOption('general', '通用笔记')
                .addOption('meeting', '会议记录')
                .addOption('idea', '创意想法')
                .addOption('todo', '待办清单')
                .setValue(this.plugin.settings.noteTemplate)
                .onChange(async (value: 'meeting' | 'idea' | 'todo' | 'general') => {
                    this.plugin.settings.noteTemplate = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('AI提示词模板')
            .setDesc('自定义发送给AI的提示词，用于控制输出格式')
            .addTextArea(text => text
                .setPlaceholder('请将这段音频内容整理成结构化的笔记格式...')
                .setValue(this.plugin.settings.promptTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.promptTemplate = value || DEFAULT_SETTINGS.promptTemplate;
                    await this.plugin.saveSettings();
                }))
            .then(setting => {
                setting.controlEl.find('textarea')?.setAttribute('rows', '4');
            });
    }

    private createAdvancedSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '⚙️ 高级设置' });

        // 重置设置按钮
        new Setting(containerEl)
            .setName('重置设置')
            .setDesc('恢复所有设置为默认值')
            .addButton(button => button
                .setButtonText('重置')
                .setWarning()
                .onClick(async () => {
                    const confirmed = confirm('确定要重置所有设置吗？此操作不可撤销。');
                    if (confirmed) {
                        this.plugin.settings = { ...DEFAULT_SETTINGS };
                        await this.plugin.saveSettings();
                        this.display(); // 重新显示设置页面
                        new Notice('设置已重置');
                    }
                }));

        // 导出设置按钮
        new Setting(containerEl)
            .setName('导出设置')
            .setDesc('将当前设置导出为JSON文件')
            .addButton(button => button
                .setButtonText('导出')
                .onClick(() => {
                    this.exportSettings();
                }));
    }

    private async testApiConnection(buttonEl: HTMLButtonElement): Promise<void> {
        if (!this.plugin.settings.apiKey.trim()) {
            this.showTestResult('请先输入API Key', 'error');
            return;
        }

        buttonEl.setText('测试中...');
        buttonEl.disabled = true;

        try {
            console.log('开始API连接测试，API Key:', this.plugin.settings.apiKey.substring(0, 10) + '...');
            
            const client = new DashScopeClient(this.plugin.settings.apiKey);
            const result = await client.testConnection();
            
            if (result.success) {
                this.showTestResult('✅ API连接成功！', 'success');
                console.log('API测试成功');
            } else {
                const errorMsg = result.error || '未知错误';
                this.showTestResult(`❌ API连接失败: ${errorMsg}`, 'error');
                console.error('API测试失败:', errorMsg);
            }
        } catch (error) {
            const errorMsg = `连接测试异常: ${error.message}`;
            this.showTestResult(`❌ ${errorMsg}`, 'error');
            console.error('API测试异常:', error);
        } finally {
            buttonEl.setText('测试连接');
            buttonEl.disabled = false;
        }
    }

    private showTestResult(message: string, type: 'success' | 'error'): void {
        if (this.apiTestResult) {
            this.apiTestResult.empty();
            const resultEl = this.apiTestResult.createDiv();
            resultEl.setText(message);
            resultEl.addClass(`test-result-${type}`);
            
            // 添加简单的样式
            if (type === 'success') {
                resultEl.style.color = '#10b981';
            } else {
                resultEl.style.color = '#ef4444';
            }
            resultEl.style.marginTop = '8px';
            resultEl.style.fontSize = '14px';
        }
    }

    private exportSettings(): void {
        const settingsData = JSON.stringify(this.plugin.settings, null, 2);
        const blob = new Blob([settingsData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'getnote-settings.json';
        link.click();
        
        URL.revokeObjectURL(url);
        new Notice('设置已导出');
    }
}