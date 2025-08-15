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
	
	// 取消状态管理
	private isProcessingCancelled: boolean = false;

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
			this.settings.enableLLMProcessing,
			() => this.handleRecordingCancel()
		);
		
		this.recordingModal.open();
	}

	private async handleAudioData(audioBlob: Blob) {
		const processingStartTime = Date.now();
		
		// 重置取消状态
		this.isProcessingCancelled = false;
		
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

			// 阶段0：保存音频文件（如果启用）
			let audioMetadata: { audioFileName?: string; audioFilePath?: string } = {};
			if (this.settings.keepOriginalAudio) {
				try {
					// 更新界面状态
					if (this.recordingModal) {
						this.recordingModal.updateProcessingState('saving-audio');
					}
					
					new Notice('正在保存音频文件...');
					console.log('开始保存音频文件');
					
					const tempFileName = this.noteGenerator.generateFileName('语音转录', new Date());
					const audioResult = await this.noteGenerator.saveAudioFile(
						audioBlob,
						this.settings.outputFolder,
						tempFileName
					);
					
					audioMetadata = {
						audioFileName: audioResult.audioFile.name,
						audioFilePath: audioResult.audioFilePath
					};
					
					console.log('音频文件保存完成:', audioResult.audioFilePath);
				} catch (audioSaveError) {
					console.error('保存音频文件失败:', audioSaveError);
					new Notice('保存音频文件失败，但会继续进行文字转录');
					// 音频保存失败不应阻止转录过程
				}
				
				// 检查音频保存后是否被取消
				if (this.isProcessingCancelled) {
					console.log('音频保存后被用户取消');
					return;
				}
			}

			// 阶段1：语音转文字
			if (this.recordingModal) {
				this.recordingModal.updateProcessingState('transcribing');
			}
			
			new Notice('正在调用AI转录音频...');
			console.log('开始语音转录处理');

			const transcribedText = await this.dashScopeClient.processAudio(audioBlob);
			
			// 检查是否被取消
			if (this.isProcessingCancelled) {
				console.log('语音转录已被用户取消');
				return;
			}
			
			console.log('语音转录完成，文本长度:', transcribedText.length);

			// 阶段2：AI增强文本处理（如果启用）
			let enhancedContent: import('./src/text-processor').EnhancedProcessingResult;
			
			if (this.settings.enableLLMProcessing && this.textProcessor) {
				// 更新界面状态
				if (this.recordingModal) {
					this.recordingModal.updateProcessingState('processing');
				}
				
				new Notice('正在使用AI增强处理文本...');
				console.log('开始AI增强文本处理');
				
				enhancedContent = await this.textProcessor.processTranscribedTextEnhanced(transcribedText);
				
				// 检查是否被取消
				if (this.isProcessingCancelled) {
					console.log('AI文本处理已被用户取消');
					return;
				}
				
				console.log('AI增强处理完成，是否已处理:', enhancedContent.isProcessed);
			} else {
				// 不启用AI处理，直接使用原始文本
				enhancedContent = {
					originalText: transcribedText,
					processedText: transcribedText,
					tags: [],
					structuredTags: { people: [], events: [], topics: [], times: [], locations: [] },
					summary: transcribedText,
					smartTitle: transcribedText.substring(0, 20) + '...',
					isProcessed: false
				};
			}

			// 阶段3：保存笔记
			if (this.recordingModal) {
				this.recordingModal.updateProcessingState('saving');
			}
			
			// 最后检查是否被取消
			if (this.isProcessingCancelled) {
				console.log('保存笔记已被用户取消');
				return;
			}
			
			// 计算处理时间
			const processingDuration = Date.now() - processingStartTime;

			// 创建笔记元数据
			const metadata: NoteMetadata = {
				title: enhancedContent.smartTitle,
				timestamp: new Date(),
				duration: '音频转录', // 由于使用Modal，录音时长在Modal中管理
				audioSize: this.noteGenerator.formatFileSize(audioBlob.size),
				processingTime: this.noteGenerator.formatDuration(processingDuration),
				model: this.settings.modelName,
				textModel: this.settings.enableLLMProcessing ? this.settings.textModel : undefined,
				isProcessed: enhancedContent.isProcessed,
				// 添加音频文件信息
				audioFileName: audioMetadata.audioFileName,
				audioFilePath: audioMetadata.audioFilePath
			};

			// 生成笔记内容（使用新的增强方法）
			const noteContent = this.noteGenerator.generateEnhancedNoteContent(
				enhancedContent,
				metadata
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
				const audioSavedMessage = this.settings.keepOriginalAudio && audioMetadata.audioFileName 
					? '，原音频已保存' 
					: '';
					
				if (enhancedContent.isProcessed) {
					const structuredTagsCount = Object.values(enhancedContent.structuredTags)
						.reduce((count, tagArray) => count + tagArray.length, 0);
					const totalTags = enhancedContent.tags.length + structuredTagsCount;
					new Notice(`AI增强处理完成！笔记已保存: ${savedFile.name}，包含${totalTags}个结构化标签${audioSavedMessage}`);
				} else {
					new Notice(`转录完成，笔记已保存: ${savedFile.name}${audioSavedMessage}`);
				}
				
				console.log('笔记保存完成:', savedFile.path);
			} else {
				// 如果不自动保存，可以显示预览或提示用户手动保存
				const message = enhancedContent.isProcessed 
					? 'AI增强处理完成，请手动保存笔记'
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

	private handleRecordingCancel() {
		console.log('用户取消了录音');
		this.isProcessingCancelled = true;
		
		// 清理录音Modal引用
		this.recordingModal = null;
		
		new Notice('录音已取消');
	}
}