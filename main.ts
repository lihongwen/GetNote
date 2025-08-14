import { Notice, Plugin, TFile } from 'obsidian';
import { AudioRecorder } from './src/recorder';
import { DashScopeClient } from './src/api-client';
import { NoteGenerator, NoteMetadata, ProcessedContent } from './src/note-generator';
import { GetNoteSettings, DEFAULT_SETTINGS, GetNoteSettingTab } from './src/settings';
import { RecordingModal } from './src/recording-modal';
import { TextProcessor } from './src/text-processor';

export default class GetNotePlugin extends Plugin {
	settings: GetNoteSettings;
	private dashScopeClient: DashScopeClient | null = null;
	private noteGenerator: NoteGenerator;
	private recordingModal: RecordingModal | null = null;
	private textProcessor: TextProcessor | null = null;

	async onload() {
		await this.loadSettings();
		
		// 初始化模块
		this.noteGenerator = new NoteGenerator(this.app);
		this.updateDashScopeClient();

		// 检查录音支持
		if (!AudioRecorder.isSupported()) {
			new Notice('当前浏览器不支持录音功能');
			return;
		}

		// 添加录音按钮到工具栏
		this.addRibbonIcon('microphone', '打开录音界面', (evt: MouseEvent) => {
			this.openRecordingModal();
		});

		// 添加命令
		this.addCommand({
			id: 'open-recording-modal',
			name: '打开录音界面',
			callback: () => {
				this.openRecordingModal();
			}
		});

		// 添加设置面板
		this.addSettingTab(new GetNoteSettingTab(this.app, this));
	}

	onunload() {
		// 清理录音Modal
		if (this.recordingModal) {
			this.recordingModal.close();
			this.recordingModal = null;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateDashScopeClient();
	}

	private updateDashScopeClient() {
		if (this.settings.apiKey) {
			this.dashScopeClient = new DashScopeClient(this.settings.apiKey);
			// 同时初始化文本处理器
			this.textProcessor = new TextProcessor(this.settings.apiKey, {
				enableLLMProcessing: this.settings.enableLLMProcessing,
				textModel: this.settings.textModel,
				processOriginalText: this.settings.processOriginalText,
				generateTags: this.settings.generateTags,
				maxRetries: this.settings.maxRetries
			});
		}
	}

	private openRecordingModal() {
		// 检查API配置
		if (!this.settings.apiKey) {
			new Notice('请先在设置中配置API Key');
			return;
		}

		if (!this.dashScopeClient) {
			new Notice('API客户端未初始化，请检查设置');
			return;
		}

		// 创建并打开录音Modal
		this.recordingModal = new RecordingModal(
			this.app,
			(audioBlob) => this.handleAudioData(audioBlob),
			(error) => this.handleRecordingError(error),
			this.settings.enableLLMProcessing
		);
		
		this.recordingModal.open();
	}

	private async handleAudioData(audioBlob: Blob) {
		const processingStartTime = Date.now();
		
		try {
			if (!this.dashScopeClient) {
				throw new Error('API客户端未初始化');
			}

			// 检查音频大小
			const sizeCheck = this.dashScopeClient.checkAudioSize(audioBlob);
			if (!sizeCheck.valid) {
				new Notice(sizeCheck.message || '音频文件过大');
				return;
			}

			// 阶段1：语音转文字
			new Notice('正在调用AI转录音频...');
			console.log('开始语音转录处理');

			const transcribedText = await this.dashScopeClient.processAudio(audioBlob);
			console.log('语音转录完成，文本长度:', transcribedText.length);

			// 阶段2：AI文本处理（如果启用）
			let processedContent: ProcessedContent;
			
			if (this.settings.enableLLMProcessing && this.textProcessor) {
				// 更新界面状态
				if (this.recordingModal) {
					this.recordingModal.updateProcessingState('processing');
				}
				
				new Notice('正在使用AI优化文本...');
				console.log('开始AI文本处理');
				
				processedContent = await this.textProcessor.processTranscribedText(transcribedText);
				console.log('AI文本处理完成，是否已处理:', processedContent.isProcessed);
			} else {
				// 不启用AI处理，直接使用原始文本
				processedContent = {
					originalText: transcribedText,
					processedText: transcribedText,
					tags: [],
					isProcessed: false
				};
			}

			// 阶段3：保存笔记
			if (this.recordingModal) {
				this.recordingModal.updateProcessingState('saving');
			}
			
			// 计算处理时间
			const processingDuration = Date.now() - processingStartTime;

			// 创建笔记元数据
			const metadata: NoteMetadata = {
				title: this.noteGenerator.extractTitleFromContent(
					processedContent.isProcessed ? processedContent.processedText : processedContent.originalText
				),
				timestamp: new Date(),
				duration: '音频转录', // 由于使用Modal，录音时长在Modal中管理
				audioSize: this.noteGenerator.formatFileSize(audioBlob.size),
				processingTime: this.noteGenerator.formatDuration(processingDuration),
				model: this.settings.modelName,
				textModel: this.settings.enableLLMProcessing ? this.settings.textModel : undefined,
				isProcessed: processedContent.isProcessed
			};

			// 生成笔记内容（使用新的AI增强方法）
			const noteContent = this.noteGenerator.generateNoteContentWithAI(
				processedContent,
				metadata,
				this.settings.includeMetadata
			);

			// 保存笔记
			if (this.settings.autoSave) {
				const fileName = this.noteGenerator.generateFileName('语音转录', metadata.timestamp);
				const savedFile = await this.noteGenerator.saveNote(
					noteContent,
					this.settings.outputFolder,
					fileName
				);
				
				// 根据处理结果显示不同的完成消息
				if (processedContent.isProcessed) {
					new Notice(`AI处理完成！笔记已保存: ${savedFile.name}，包含${processedContent.tags.length}个标签`);
				} else {
					new Notice(`转录完成，笔记已保存: ${savedFile.name}`);
				}
				
				console.log('笔记保存完成:', savedFile.path);
			} else {
				// 如果不自动保存，可以显示预览或提示用户手动保存
				const message = processedContent.isProcessed 
					? 'AI文本处理完成，请手动保存笔记'
					: '音频转录完成，请手动保存笔记';
				new Notice(message);
			}

		} catch (error) {
			console.error('处理音频时出错:', error);
			new Notice(`处理音频时出错: ${error.message}`);
			
			// 发生错误时重置界面状态
			if (this.recordingModal) {
				this.recordingModal.close();
			}
		}
	}

	private handleRecordingError(error: Error) {
		console.error('录音错误:', error);
		new Notice(`录音出错: ${error.message}`);
	}
}