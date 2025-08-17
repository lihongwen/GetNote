import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import GetNotePlugin from '../main';
import { DashScopeClient } from './api-client';
import { TextProcessor, TextProcessorSettings, DEFAULT_TEXT_PROCESSOR_SETTINGS } from './text-processor';

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
    // LLM文本处理设置
    enableLLMProcessing: boolean;
    textModel: string;
    processOriginalText: boolean;
    generateTags: boolean;
    maxRetries: number;
    // 音频保留设置
    keepOriginalAudio: boolean;
    // OCR图片处理设置
    enableImageOCR: boolean;
    ocrModel: string;
    includeOCRInNote: boolean;
    showOriginalImages: boolean;
    combineAudioAndOCR: boolean;
    maxImageSize: number; // MB
    // Wake Lock防锁屏设置
    enableWakeLock: boolean;
}

export const DEFAULT_SETTINGS: GetNoteSettings = {
    apiKey: '',
    modelName: 'qwen-audio-asr-latest',
    outputFolder: 'GetNote',
    audioQuality: 'medium',
    maxRecordingDuration: 300, // 5分钟
    autoSave: true,
    includeTimestamp: true,
    includeMetadata: true,
    promptTemplate: '转录完成的文本将自动整理成笔记格式',
    noteTemplate: 'general',
    // LLM文本处理默认设置
    enableLLMProcessing: false,
    textModel: 'qwen-plus-latest',
    processOriginalText: true,
    generateTags: true,
    maxRetries: 2,
    // 音频保留默认设置
    keepOriginalAudio: false,
    // OCR图片处理默认设置
    enableImageOCR: false,
    ocrModel: 'qwen-vl-ocr-latest',
    includeOCRInNote: true,
    showOriginalImages: true,
    combineAudioAndOCR: true,
    maxImageSize: 10, // 10MB
    // Wake Lock防锁屏默认设置
    enableWakeLock: true
};

export class GetNoteSettingTab extends PluginSettingTab {
    plugin: GetNotePlugin;
    private apiTestResult: HTMLElement | null = null;
    private textLLMTestResult: HTMLElement | null = null;
    private ocrTestResult: HTMLElement | null = null;

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

        // LLM文本处理设置部分
        this.createLLMSettings(containerEl);

        // OCR图片处理设置部分
        this.createOCRSettings(containerEl);

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
            .setDesc('使用的语音转文字模型')
            .addDropdown(dropdown => dropdown
                .addOption('qwen-audio-asr-latest', 'Qwen Audio ASR Latest (语音转文字专用)')
                .addOption('qwen-audio-asr', 'Qwen Audio ASR (语音转文字)')
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

    private createLLMSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '🤖 AI文本处理设置' });

        // LLM功能开关
        new Setting(containerEl)
            .setName('启用AI文本处理')
            .setDesc('使用AI模型对语音转录文本进行优化和标签生成')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableLLMProcessing)
                .onChange(async (value) => {
                    this.plugin.settings.enableLLMProcessing = value;
                    await this.plugin.saveSettings();
                    // 重新显示设置页面以更新相关设置的可见性
                    this.display();
                }));

        // 只有启用LLM处理时才显示以下设置
        if (this.plugin.settings.enableLLMProcessing) {
            new Setting(containerEl)
                .setName('文本处理模型')
                .setDesc('选择用于文本处理的AI模型')
                .addDropdown(dropdown => dropdown
                    .addOption('qwen-plus-latest', 'Qwen Plus Latest (推荐)')
                    .addOption('qwen-turbo-latest', 'Qwen Turbo Latest (快速)')
                    .addOption('qwen-max-latest', 'Qwen Max Latest (高质量)')
                    .setValue(this.plugin.settings.textModel)
                    .onChange(async (value) => {
                        this.plugin.settings.textModel = value;
                        await this.plugin.saveSettings();
                        // 清除文本LLM测试结果
                        if (this.textLLMTestResult) {
                            this.textLLMTestResult.empty();
                        }
                    }));

            new Setting(containerEl)
                .setName('文本优化')
                .setDesc('对原始转录文本进行语法优化和表达改进')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.processOriginalText)
                    .onChange(async (value) => {
                        this.plugin.settings.processOriginalText = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('自动生成标签')
                .setDesc('根据文本内容自动生成相关标签')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.generateTags)
                    .onChange(async (value) => {
                        this.plugin.settings.generateTags = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('重试次数')
                .setDesc('AI处理失败时的重试次数')
                .addText(text => text
                    .setPlaceholder('2')
                    .setValue(this.plugin.settings.maxRetries.toString())
                    .onChange(async (value) => {
                        const retries = parseInt(value) || 2;
                        this.plugin.settings.maxRetries = Math.max(1, Math.min(5, retries));
                        await this.plugin.saveSettings();
                    }));

            // 文本LLM测试按钮
            const textLLMTestSetting = new Setting(containerEl)
                .setName('文本AI测试')
                .setDesc('测试文本处理AI模型是否正常工作')
                .addButton(button => button
                    .setButtonText('测试文本AI')
                    .setCta()
                    .onClick(async () => {
                        await this.testTextLLM(button.buttonEl);
                    }));

            // 文本LLM测试结果显示区域
            this.textLLMTestResult = textLLMTestSetting.settingEl.createDiv('text-llm-test-result');
        }
    }

    private createOCRSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '🔍 OCR图片识别设置' });

        // OCR功能开关
        new Setting(containerEl)
            .setName('启用图片OCR识别')
            .setDesc('使用AI模型识别图片中的文字内容，支持与语音笔记结合')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableImageOCR)
                .onChange(async (value) => {
                    this.plugin.settings.enableImageOCR = value;
                    await this.plugin.saveSettings();
                    // 重新显示设置页面以更新相关设置的可见性
                    this.display();
                }));

        // 只有启用OCR处理时才显示以下设置
        if (this.plugin.settings.enableImageOCR) {
            new Setting(containerEl)
                .setName('OCR识别模型')
                .setDesc('选择用于图片文字识别的AI模型')
                .addDropdown(dropdown => dropdown
                    .addOption('qwen-vl-ocr-latest', 'Qwen VL OCR Latest (推荐)')
                    .addOption('qwen-vl-ocr', 'Qwen VL OCR (标准版)')
                    .setValue(this.plugin.settings.ocrModel)
                    .onChange(async (value) => {
                        this.plugin.settings.ocrModel = value;
                        await this.plugin.saveSettings();
                        // 清除OCR测试结果
                        if (this.ocrTestResult) {
                            this.ocrTestResult.empty();
                        }
                    }));

            new Setting(containerEl)
                .setName('OCR内容显示')
                .setDesc('在生成的笔记中显示OCR识别的文字内容')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.includeOCRInNote)
                    .onChange(async (value) => {
                        this.plugin.settings.includeOCRInNote = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('显示原始图片')
                .setDesc('在笔记中显示原始图片文件')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.showOriginalImages)
                    .onChange(async (value) => {
                        this.plugin.settings.showOriginalImages = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('音频与OCR文字合并')
                .setDesc('将语音转录文字和OCR识别文字合并后一起发送给AI进行处理')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.combineAudioAndOCR)
                    .onChange(async (value) => {
                        this.plugin.settings.combineAudioAndOCR = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('图片大小限制')
                .setDesc('单张图片的最大文件大小（MB）')
                .addText(text => text
                    .setPlaceholder('10')
                    .setValue(this.plugin.settings.maxImageSize.toString())
                    .onChange(async (value) => {
                        const size = parseInt(value) || 10;
                        this.plugin.settings.maxImageSize = Math.max(1, Math.min(50, size));
                        await this.plugin.saveSettings();
                    }));

            // OCR测试按钮
            const ocrTestSetting = new Setting(containerEl)
                .setName('OCR功能测试')
                .setDesc('测试OCR图片识别功能是否正常工作')
                .addButton(button => button
                    .setButtonText('测试OCR')
                    .setCta()
                    .onClick(async () => {
                        await this.testOCR(button.buttonEl);
                    }));

            // OCR测试结果显示区域
            this.ocrTestResult = ocrTestSetting.settingEl.createDiv('ocr-test-result');
        }
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

        new Setting(containerEl)
            .setName('保留原音频文件')
            .setDesc('在生成文字笔记的同时保存原音频文件，可随时回听录音内容（会占用更多存储空间）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.keepOriginalAudio)
                .onChange(async (value) => {
                    this.plugin.settings.keepOriginalAudio = value;
                    await this.plugin.saveSettings();
                }));

        // Wake Lock防锁屏设置
        const wakeLockSetting = new Setting(containerEl)
            .setName('防锁屏功能')
            .setDesc('录音时自动防止设备锁屏，确保录音不被中断（适用于支持Wake Lock API的现代浏览器）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWakeLock)
                .onChange(async (value) => {
                    this.plugin.settings.enableWakeLock = value;
                    await this.plugin.saveSettings();
                }));

        // 添加Wake Lock支持状态检查
        this.addWakeLockStatus(wakeLockSetting.settingEl);
    }

    /**
     * 添加Wake Lock支持状态显示
     */
    private addWakeLockStatus(settingEl: HTMLElement): void {
        // 导入AudioRecorder以使用其静态方法
        import('./recorder').then(({ AudioRecorder }) => {
            const wakeLockSupport = AudioRecorder.checkWakeLockSupport();
            
            const statusDiv = settingEl.createDiv('wake-lock-status');
            statusDiv.style.marginTop = '8px';
            statusDiv.style.padding = '8px';
            statusDiv.style.borderRadius = '4px';
            statusDiv.style.fontSize = '0.85rem';
            
            if (wakeLockSupport.isSupported) {
                statusDiv.style.backgroundColor = 'rgba(0, 200, 0, 0.1)';
                statusDiv.style.color = 'var(--color-green)';
                statusDiv.style.border = '1px solid rgba(0, 200, 0, 0.3)';
                statusDiv.textContent = `✅ ${wakeLockSupport.message}`;
            } else {
                statusDiv.style.backgroundColor = 'rgba(255, 140, 0, 0.1)';
                statusDiv.style.color = 'var(--color-orange)';
                statusDiv.style.border = '1px solid rgba(255, 140, 0, 0.3)';
                statusDiv.textContent = `⚠️ ${wakeLockSupport.message}`;
            }

            // 添加详细信息
            const detailsDiv = statusDiv.createDiv();
            detailsDiv.style.marginTop = '4px';
            detailsDiv.style.fontSize = '0.75rem';
            detailsDiv.style.opacity = '0.8';
            
            const details = [
                `浏览器: ${wakeLockSupport.isSafari ? 'Safari' : '其他'}`,
                `设备: ${wakeLockSupport.isIOS ? 'iOS' : '非iOS'}`,
                `协议: ${wakeLockSupport.isHTTPS ? 'HTTPS' : 'HTTP'}`
            ];
            detailsDiv.textContent = details.join(' | ');
        }).catch(error => {
            console.error('加载AudioRecorder模块失败:', error);
        });
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
            .setName('笔记格式说明')
            .setDesc('qwen-audio-asr模型专门用于语音转文字，会直接输出转录文本，无需复杂提示词')
            .addTextArea(text => text
                .setPlaceholder('语音转文字完成后，文本将自动整理为笔记...')
                .setValue(this.plugin.settings.promptTemplate)
                .setDisabled(true) // 禁用编辑，因为ASR模型不需要提示词
                .onChange(async (value) => {
                    this.plugin.settings.promptTemplate = value || DEFAULT_SETTINGS.promptTemplate;
                    await this.plugin.saveSettings();
                }))
            .then(setting => {
                setting.controlEl.find('textarea')?.setAttribute('rows', '2');
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

    private async testTextLLM(buttonEl: HTMLButtonElement): Promise<void> {
        if (!this.plugin.settings.apiKey.trim()) {
            this.showTextLLMTestResult('请先输入API Key', 'error');
            return;
        }

        buttonEl.setText('测试中...');
        buttonEl.disabled = true;

        try {
            console.log('开始文本LLM测试，模型:', this.plugin.settings.textModel);
            
            const textProcessor = new TextProcessor(this.plugin.settings.apiKey, {
                enableLLMProcessing: true,
                textModel: this.plugin.settings.textModel,
                processOriginalText: this.plugin.settings.processOriginalText,
                generateTags: this.plugin.settings.generateTags,
                maxRetries: this.plugin.settings.maxRetries
            });

            const result = await textProcessor.testLLMConnection();
            
            if (result.success) {
                this.showTextLLMTestResult('✅ 文本AI连接成功！', 'success');
                console.log('文本LLM测试成功');
            } else {
                const errorMsg = result.error || '未知错误';
                this.showTextLLMTestResult(`❌ 文本AI连接失败: ${errorMsg}`, 'error');
                console.error('文本LLM测试失败:', errorMsg);
            }
        } catch (error) {
            const errorMsg = `文本AI测试异常: ${error.message}`;
            this.showTextLLMTestResult(`❌ ${errorMsg}`, 'error');
            console.error('文本LLM测试异常:', error);
        } finally {
            buttonEl.setText('测试文本AI');
            buttonEl.disabled = false;
        }
    }

    private async testOCR(buttonEl: HTMLButtonElement): Promise<void> {
        if (!this.plugin.settings.apiKey.trim()) {
            this.showOCRTestResult('请先输入API Key', 'error');
            return;
        }

        buttonEl.setText('测试中...');
        buttonEl.disabled = true;

        try {
            console.log('开始OCR功能测试，模型:', this.plugin.settings.ocrModel);
            
            const client = new DashScopeClient(this.plugin.settings.apiKey);
            const result = await client.testOCR();
            
            if (result.success) {
                this.showOCRTestResult('✅ OCR功能测试成功！', 'success');
                console.log('OCR测试成功');
            } else {
                const errorMsg = result.error || '未知错误';
                this.showOCRTestResult(`❌ OCR功能测试失败: ${errorMsg}`, 'error');
                console.error('OCR测试失败:', errorMsg);
            }
        } catch (error) {
            const errorMsg = `OCR测试异常: ${error.message}`;
            this.showOCRTestResult(`❌ ${errorMsg}`, 'error');
            console.error('OCR测试异常:', error);
        } finally {
            buttonEl.setText('测试OCR');
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

    private showTextLLMTestResult(message: string, type: 'success' | 'error'): void {
        if (this.textLLMTestResult) {
            this.textLLMTestResult.empty();
            const resultEl = this.textLLMTestResult.createDiv();
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

    private showOCRTestResult(message: string, type: 'success' | 'error'): void {
        if (this.ocrTestResult) {
            this.ocrTestResult.empty();
            const resultEl = this.ocrTestResult.createDiv();
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