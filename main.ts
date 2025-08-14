import { Notice, Plugin, TFile } from 'obsidian';
import { AudioRecorder } from './src/recorder';
import { DashScopeClient } from './src/api-client';
import { NoteGenerator, NoteMetadata } from './src/note-generator';
import { GetNoteSettings, DEFAULT_SETTINGS, GetNoteSettingTab } from './src/settings';
import { RecordingModal } from './src/recording-modal';

export default class GetNotePlugin extends Plugin {
	settings: GetNoteSettings;
	private dashScopeClient: DashScopeClient | null = null;
	private noteGenerator: NoteGenerator;
	private recordingModal: RecordingModal | null = null;

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
			(error) => this.handleRecordingError(error)
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

			new Notice('正在调用AI转录音频...');

			// 调用API处理音频 - 注意：qwen-audio-asr-latest不需要提示词
			const aiResponse = await this.dashScopeClient.processAudio(audioBlob);

			// 计算处理时间
			const processingDuration = Date.now() - processingStartTime;

			// 创建笔记元数据
			const metadata: NoteMetadata = {
				title: this.noteGenerator.extractTitleFromContent(aiResponse),
				timestamp: new Date(),
				duration: '音频转录', // 由于使用Modal，录音时长在Modal中管理
				audioSize: this.noteGenerator.formatFileSize(audioBlob.size),
				processingTime: this.noteGenerator.formatDuration(processingDuration),
				model: this.settings.modelName
			};

			// 生成笔记内容
			const noteContent = this.noteGenerator.generateNoteContent(
				aiResponse,
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
				
				new Notice(`转录完成，笔记已保存: ${savedFile.name}`);
			} else {
				// 如果不自动保存，可以显示预览或提示用户手动保存
				new Notice('音频转录完成，请手动保存笔记');
			}

		} catch (error) {
			console.error('处理音频时出错:', error);
			new Notice(`处理音频时出错: ${error.message}`);
		}
	}

	private handleRecordingError(error: Error) {
		console.error('录音错误:', error);
		new Notice(`录音出错: ${error.message}`);
	}
}