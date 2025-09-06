import { Notice, Plugin, TFile } from 'obsidian';
import { AudioRecorder } from './src/recorder';
import { DashScopeClient, OCRResult } from './src/api-client';
import { NoteGenerator, NoteMetadata, ProcessedContent } from './src/note-generator';
import { GetNoteSettings, DEFAULT_SETTINGS, GetNoteSettingTab } from './src/settings';
import { RecordingModal } from './src/recording-modal';
import { TextProcessor, MultimodalProcessingResult } from './src/text-processor';
import { ImageManager, ImageItem } from './src/image-manager';
import { MultimodalContent, MultimodalMetadata } from './src/types';

export default class GetNotePlugin extends Plugin {
	settings: GetNoteSettings;
	private dashScopeClient: DashScopeClient | null = null;
	private noteGenerator: NoteGenerator;
	private recordingModal: RecordingModal | null = null;
	private textProcessor: TextProcessor | null = null;
	private closeRibbonIcon: HTMLElement | null = null;
	
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

		// 添加关闭录音界面按钮到工具栏（仅在录音界面开启时显示）
		const closeRibbonIcon = this.addRibbonIcon('square', '关闭录音界面', (evt: MouseEvent) => {
			this.closeRecordingGracefully();
		});
		
		// 初始状态下隐藏关闭按钮
		closeRibbonIcon.style.display = 'none';
		
		// 保存关闭按钮引用用于动态显示/隐藏
		this.closeRibbonIcon = closeRibbonIcon;

		// 添加命令
		this.addCommand({
			id: 'open-recording-modal',
			name: '打开录音界面',
			callback: () => {
				this.openRecordingModal();
			}
		});

		// 添加关闭录音界面命令 - 优化为在系统菜单中显示
		this.addCommand({
			id: 'close-recording',
			name: 'GetNote: 关闭录音界面',
			hotkeys: [{ modifiers: ["Mod"], key: "Escape" }],
			checkCallback: (checking: boolean) => {
				// 只在有活跃录音界面时显示此命令
				const hasActiveRecording = this.recordingModal !== null;
				if (hasActiveRecording) {
					if (!checking) {
						this.closeRecordingGracefully();
					}
					return true;
				}
				return false;
			}
		});

		// 保留紧急关闭命令作为备用（用于调试和故障恢复）
		this.addCommand({
			id: 'emergency-close-recording',
			name: '强制关闭录音界面（紧急）',
			callback: () => {
				this.emergencyCloseRecording();
			}
		});

		// 添加设置面板
		this.addSettingTab(new GetNoteSettingTab(this.app, this));
	}

	onunload() {
		// 设置取消标志并清理录音Modal
		this.isProcessingCancelled = true;
		if (this.recordingModal) {
			this.recordingModal.close();
			this.recordingModal = null;
		}
		// 清理ribbon icon引用
		this.hideCloseRibbonIcon();
		this.closeRibbonIcon = null;
	}

	/**
	 * 显示关闭录音界面按钮
	 */
	private showCloseRibbonIcon(): void {
		if (this.closeRibbonIcon) {
			this.closeRibbonIcon.style.display = '';
		}
	}

	/**
	 * 隐藏关闭录音界面按钮
	 */
	private hideCloseRibbonIcon(): void {
		if (this.closeRibbonIcon) {
			this.closeRibbonIcon.style.display = 'none';
		}
	}

	/**
	 * 优雅关闭录音界面 - 主要的关闭方法
	 */
	private closeRecordingGracefully(): void {
		console.log('[CLOSE] 执行优雅关闭录音界面');
		
		if (this.recordingModal) {
			try {
				// 使用Modal的正常关闭方法，这会触发确认对话框
				this.recordingModal.close();
				new Notice('正在关闭录音界面...');
			} catch (error) {
				console.error('[CLOSE] 优雅关闭失败，尝试紧急关闭:', error);
				// 如果优雅关闭失败，回退到紧急关闭
				this.emergencyCloseRecording();
			}
		} else {
			new Notice('没有活跃的录音界面需要关闭');
		}
	}

	/**
	 * 紧急关闭录音界面 - 用于iPhone调试和故障恢复
	 */
	private emergencyCloseRecording(): void {
		console.log('[EMERGENCY] 执行紧急关闭录音界面');
		
		if (this.recordingModal) {
			try {
				// 使用Modal的紧急关闭方法
				this.recordingModal.emergencyClose();
				new Notice('已强制关闭录音界面');
			} catch (error) {
				console.error('[EMERGENCY] 紧急关闭失败:', error);
				new Notice('紧急关闭失败，请刷新页面');
			} finally {
				this.recordingModal = null;
				this.hideCloseRibbonIcon();
			}
		} else {
			new Notice('没有找到活跃的录音界面');
		}
		
		// 重置处理状态
		this.isProcessingCancelled = true;
		
		// 额外安全措施：移除所有可能的Modal覆盖层
		try {
			const overlays = document.querySelectorAll('.modal, [style*="z-index: 10000"]');
			overlays.forEach((overlay, index) => {
				if (overlay.parentNode) {
					console.log(`[EMERGENCY] 移除覆盖层 ${index + 1}:`, overlay);
					overlay.parentNode.removeChild(overlay);
				}
			});
		} catch (error) {
			console.error('[EMERGENCY] 清理覆盖层时出错:', error);
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

		// 重置取消状态（开始新录音时）
		this.isProcessingCancelled = false;

		// 创建并打开录音Modal
		this.recordingModal = new RecordingModal(
			this.app,
			(audioBlob, images) => this.handleMultimodalData(audioBlob, images),
			(error) => this.handleRecordingError(error),
			this.settings.enableLLMProcessing,
			this.settings.enableImageOCR,
			() => this.handleRecordingCancel()
		);
		
		this.recordingModal.open();
		
		// 显示关闭按钮
		this.showCloseRibbonIcon();
	}

	private async handleMultimodalData(audioBlob: Blob, images?: ImageItem[]) {
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

			// 判断内容类型
			const hasAudio = audioBlob.size > 0;
			const hasImages = images && images.length > 0;
			const isMultimodal = hasAudio && hasImages;


			// 阶段0：保存音频文件（如果启用）
			let audioMetadata: { audioFileName?: string; audioFilePath?: string; audioBlob?: Blob } = {};
			if (this.settings.keepOriginalAudio && hasAudio) {
				try {
					// 更新界面状态
					if (this.recordingModal) {
						this.recordingModal.updateProcessingState('saving-audio');
					}
					
					new Notice('正在保存音频文件...');
						
					const tempFileName = this.noteGenerator.generateFileName('多模态笔记', new Date());
					const audioResult = await this.noteGenerator.saveAudioFile(
						audioBlob,
						this.settings.outputFolder,
						tempFileName
					);
					
					audioMetadata = {
						audioFileName: audioResult.audioFile.name,
						audioFilePath: audioResult.audioFilePath,
						audioBlob: audioBlob
					};
					
					} catch (audioSaveError) {
					console.error('保存音频文件失败:', audioSaveError);
					new Notice('保存音频文件失败，但会继续进行处理');
				}
				
				// 检查音频保存后是否被取消
				if (this.isProcessingCancelled) {
						return;
				}
			}

			// 阶段1：语音转文字
			let transcribedText = '';
			if (hasAudio) {
				if (this.recordingModal) {
					this.recordingModal.updateProcessingState('transcribing');
				}
				
				new Notice('正在调用AI转录音频...');
	
				transcribedText = await this.dashScopeClient.processAudio(audioBlob);
				
				// 检查是否被取消
				if (this.isProcessingCancelled) {
						return;
				}
				
				}

			// 阶段2：OCR图片识别
			let ocrResults: Map<string, OCRResult> = new Map();
			let totalOCRText = '';
			if (hasImages && this.settings.enableImageOCR) {
				if (this.recordingModal) {
					this.recordingModal.updateProcessingState('ocr-processing');
				}
				
				new Notice(`正在识别${images.length}张图片中的文字...`);
	
				// 并行处理所有图片OCR
				const ocrPromises = images.map(async (image) => {
					try {
						// 将DataURL转换为base64
						const base64Data = image.originalDataUrl.split(',')[1];
						const result = await this.dashScopeClient.processImageOCR(base64Data, image.fileType);
						ocrResults.set(image.id, result);
							return { imageId: image.id, result };
					} catch (error) {
						console.error(`图片${image.fileName}OCR失败:`, error);
						return { imageId: image.id, error };
					}
				});

				await Promise.all(ocrPromises);
				
				// 检查是否被取消
				if (this.isProcessingCancelled) {
						return;
				}

				// 合并所有OCR文本
				totalOCRText = Array.from(ocrResults.values())
					.map(result => result.text)
					.filter(text => text.trim().length > 0)
					.join('\n\n');
				
				}

			// 构建多模态内容
			const multimodalContent: MultimodalContent = {
				audio: hasAudio ? {
					transcribedText: transcribedText,
					duration: '录音时长', // Modal中管理
					audioFileName: audioMetadata.audioFileName,
					audioFilePath: audioMetadata.audioFilePath,
					audioBlob: audioMetadata.audioBlob
				} : undefined,
				images: hasImages ? {
					items: images,
					ocrResults: ocrResults,
					totalOCRText: totalOCRText
				} : undefined,
				combinedText: this.combineAudioAndOCRText(transcribedText, totalOCRText),
				metadata: {
					hasAudio: hasAudio,
					hasImages: hasImages,
					audioCount: hasAudio ? 1 : 0,
					imageCount: hasImages ? images.length : 0,
					totalProcessingTime: '',
					models: {
						speechModel: hasAudio ? this.settings.modelName : undefined,
						ocrModel: hasImages && this.settings.enableImageOCR ? this.settings.ocrModel : undefined,
						textModel: this.settings.enableLLMProcessing ? this.settings.textModel : undefined
					},
					createdAt: new Date()
				}
			};

			// 阶段3：多模态AI处理（如果启用）
			let multimodalResult: MultimodalProcessingResult;
			
			if ((this.settings.enableLLMProcessing || (hasImages && this.settings.combineAudioAndOCR)) && this.textProcessor) {
				// 更新界面状态
				if (this.recordingModal) {
					this.recordingModal.updateProcessingState('processing');
				}
				
				new Notice('正在使用AI处理多模态内容...');
					
				multimodalResult = await this.textProcessor.processMultimodalContent(multimodalContent);
				
				// 检查是否被取消
				if (this.isProcessingCancelled) {
						return;
				}
				
				} else {
				// 不启用AI处理，构建基础结果
				multimodalResult = {
					audioText: transcribedText,
					ocrText: totalOCRText,
					combinedText: multimodalContent.combinedText,
					processedText: multimodalContent.combinedText,
					summary: multimodalContent.combinedText,
					tags: [],
					structuredTags: { people: [], events: [], topics: [], times: [], locations: [] },
					smartTitle: this.generateBasicTitle(multimodalContent.combinedText),
					isProcessed: false,
					audioOnly: hasAudio && !hasImages,
					imageOnly: !hasAudio && hasImages,
					multimodal: isMultimodal
				};
			}

			// 阶段4：保存图片到vault（如果有图片）
			if (hasImages && this.settings.showOriginalImages) {
				try {
					new Notice('正在保存图片文件...');
	
					for (const image of images) {
						const imageResult = await this.noteGenerator.saveImageFile(
							image,
							this.settings.outputFolder
						);
						// 更新图片的vault路径信息
						image.vaultPath = imageResult.relativePath;
						image.vaultFile = imageResult.imageFile;
					}
					
					} catch (imageSaveError) {
					console.error('保存图片失败:', imageSaveError);
					new Notice('保存图片失败，但会继续生成笔记');
				}
			}

			// 阶段5：保存笔记
			if (this.recordingModal) {
				this.recordingModal.updateProcessingState('saving');
			}
			
			// 最后检查是否被取消
			if (this.isProcessingCancelled) {
					return;
			}
			
			// 更新处理时间
			const processingDuration = Date.now() - processingStartTime;
			multimodalContent.metadata.totalProcessingTime = this.noteGenerator.formatDuration(processingDuration);
			multimodalContent.metadata.processedAt = new Date();

			// 保存笔记
			try {
			if (this.settings.autoSave) {
				const fileName = this.noteGenerator.generateFileName(
					isMultimodal ? '多模态笔记' : hasImages ? '图片笔记' : '语音笔记', 
					multimodalContent.metadata.createdAt
				);
				
				// 使用多模态笔记生成器
				const noteContent = this.noteGenerator.generateMultimodalNoteContent(
					multimodalContent,
					{
						includeAudioSection: hasAudio,
						includeOCRSection: hasImages && this.settings.includeOCRInNote,
						includeImageSection: hasImages && this.settings.showOriginalImages,
						includeSummarySection: multimodalResult.isProcessed,
						includeMetadata: this.settings.includeMetadata,
						audioOptions: {
							includeOriginalAudio: this.settings.keepOriginalAudio,
							showTranscription: true
						},
						imageOptions: {
							includeOriginalImages: this.settings.showOriginalImages,
							showOCRText: this.settings.includeOCRInNote,
							thumbnailSize: 'medium'
						},
						summaryOptions: {
							generateTags: this.settings.generateTags,
							generateSummary: true,
							combineAudioAndOCR: this.settings.combineAudioAndOCR
						}
					},
					multimodalResult // 关键修复：传递AI处理结果
				);

				const savedFile = await this.noteGenerator.saveNote(
					noteContent,
					this.settings.outputFolder,
					fileName
				);
				
				// 根据处理结果显示完成消息
				const contentSummary = this.generateCompletionMessage(multimodalResult, hasAudio, hasImages, audioMetadata.audioFileName);
				new Notice(`${contentSummary}笔记已保存: ${savedFile.name}`);
				
				} else {
				const message = multimodalResult.isProcessed 
					? '多模态AI处理完成，请手动保存笔记'
					: '多模态内容处理完成，请手动保存笔记';
				new Notice(message);
			}
			} catch (saveError) {
				console.error('保存笔记时出错:', saveError);
				new Notice(`保存笔记失败: ${saveError.message}`);
			}
			
			// 清理录音Modal引用（正常完成）
			this.recordingModal = null;
			this.hideCloseRibbonIcon();

		} catch (error) {
			console.error('处理多模态内容时出错:', error);
			new Notice(`处理多模态内容时出错: ${error.message}`);
			
			// 错误恢复：重置所有处理状态
			this.isProcessingCancelled = true;
			
			// 安全清理录音Modal引用和状态
			if (this.recordingModal) {
				try {
					this.recordingModal.close();
				} catch (modalError) {
					console.error('错误处理期间关闭Modal失败:', modalError);
				} finally {
					this.recordingModal = null;
					this.hideCloseRibbonIcon();
				}
			} else {
				this.recordingModal = null;
				this.hideCloseRibbonIcon();
			}
		}
	}

	private handleRecordingError(error: Error) {
		console.error('录音错误:', error);
		new Notice(`录音出错: ${error.message}`);
		
		// 错误恢复：重置处理状态和清理Modal
		this.isProcessingCancelled = true;
		
		// 安全清理录音Modal引用
		if (this.recordingModal) {
			try {
				// 尝试正常关闭Modal
				this.recordingModal.close();
			} catch (modalError) {
				console.error('关闭Modal时出错:', modalError);
				// 强制清理引用，防止悬挂状态
			} finally {
				this.recordingModal = null;
				this.hideCloseRibbonIcon();
			}
		} else {
			this.recordingModal = null;
			this.hideCloseRibbonIcon();
		}
	}

	private handleRecordingCancel() {
		// 防止重复调用
		if (this.isProcessingCancelled) {
			return;
		}
		
		this.isProcessingCancelled = true;
		
		// 只显示一次取消通知
		new Notice('录音已取消');
		
		// 清理Modal引用
		if (this.recordingModal) {
			this.recordingModal = null;
			this.hideCloseRibbonIcon();
		}
	}

	/**
	 * 合并音频和OCR文字
	 */
	private combineAudioAndOCRText(audioText: string, ocrText: string): string {
		const parts = [];
		
		if (audioText && audioText.trim()) {
			parts.push('【语音内容】\n' + audioText.trim());
		}
		
		if (ocrText && ocrText.trim()) {
			parts.push('【图片文字】\n' + ocrText.trim());
		}
		
		return parts.join('\n\n');
	}

	/**
	 * 生成完成消息
	 */
	private generateCompletionMessage(
		result: MultimodalProcessingResult, 
		hasAudio: boolean, 
		hasImages: boolean, 
		audioFileName?: string
	): string {
		const parts = [];
		
		// 内容类型
		if (result.multimodal) {
			parts.push('多模态AI处理完成！');
		} else if (result.audioOnly) {
			parts.push('语音AI处理完成！');
		} else if (result.imageOnly) {
			parts.push('图片OCR处理完成！');
		}
		
		// 处理结果
		if (result.isProcessed) {
			const totalTags = result.tags.length + Object.values(result.structuredTags)
				.reduce((count, tagArray) => count + tagArray.length, 0);
			if (totalTags > 0) {
				parts.push(`包含${totalTags}个结构化标签`);
			}
		}
		
		// 文件保存状态
		const fileParts = [];
		if (hasAudio && audioFileName) {
			fileParts.push('原音频已保存');
		}
		if (hasImages) {
			fileParts.push('图片已保存');
		}
		
		if (fileParts.length > 0) {
			parts.push(`，${fileParts.join('，')}`);
		}
		
		return parts.join('') + '，';
	}

	/**
	 * 生成基础标题
	 */
	private generateBasicTitle(text: string): string {
		if (!text || text.trim().length === 0) {
			return '多模态笔记';
		}
		
		// 提取文本前几个词作为标题
		const words = text.trim().split(/\s+/);
		let title = words.slice(0, 8).join(' ');
		
		if (title.length > 30) {
			title = title.substring(0, 27) + '...';
		}
		
		return title || '多模态笔记';
	}
}