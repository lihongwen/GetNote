import { Notice, Plugin, TFile } from 'obsidian';
import { AudioRecorder } from './src/recorder';
import { DashScopeClient } from './src/api-client';
import { NoteGenerator, NoteMetadata } from './src/note-generator';
import { GetNoteSettings, DEFAULT_SETTINGS, GetNoteSettingTab } from './src/settings';

export default class GetNotePlugin extends Plugin {
	settings: GetNoteSettings;
	private audioRecorder: AudioRecorder | null = null;
	private dashScopeClient: DashScopeClient | null = null;
	private noteGenerator: NoteGenerator;
	private recordingStartTime: number = 0;

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
		this.addRibbonIcon('microphone', '开始录音', (evt: MouseEvent) => {
			this.toggleRecording();
		});

		// 添加命令
		this.addCommand({
			id: 'start-recording',
			name: '开始语音录制',
			callback: () => {
				this.startRecording();
			}
		});

		this.addCommand({
			id: 'stop-recording',
			name: '停止语音录制',
			callback: () => {
				this.stopRecording();
			}
		});

		this.addCommand({
			id: 'toggle-recording',
			name: '切换录音状态',
			callback: () => {
				this.toggleRecording();
			}
		});

		// 添加设置面板
		this.addSettingTab(new GetNoteSettingTab(this.app, this));
	}

	onunload() {
		if (this.audioRecorder?.getRecordingState()) {
			this.audioRecorder.stopRecording();
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

	private async toggleRecording() {
		if (this.audioRecorder?.getRecordingState()) {
			await this.stopRecording();
		} else {
			await this.startRecording();
		}
	}

	private async startRecording() {
		if (!this.settings.apiKey) {
			new Notice('请先在设置中配置API Key');
			return;
		}

		if (!this.dashScopeClient) {
			new Notice('API客户端未初始化，请检查设置');
			return;
		}

		// 检查麦克风权限
		const hasPermission = await AudioRecorder.checkMicrophonePermission();
		if (!hasPermission) {
			new Notice('需要麦克风权限才能录音');
			return;
		}

		try {
			this.audioRecorder = new AudioRecorder(
				(audioBlob) => this.handleAudioData(audioBlob),
				(error) => this.handleRecordingError(error)
			);

			await this.audioRecorder.startRecording();
			this.recordingStartTime = Date.now();
			
			new Notice('开始录音...');
			
			// 设置最大录音时长定时器
			setTimeout(() => {
				if (this.audioRecorder?.getRecordingState()) {
					this.audioRecorder.stopRecording();
					new Notice(`已达到最大录音时长 ${this.settings.maxRecordingDuration} 秒`);
				}
			}, this.settings.maxRecordingDuration * 1000);

		} catch (error) {
			new Notice(`无法开始录音: ${error.message}`);
		}
	}

	private async stopRecording() {
		if (this.audioRecorder?.getRecordingState()) {
			this.audioRecorder.stopRecording();
			new Notice('录音结束，正在处理...');
		}
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

			new Notice('正在调用AI分析音频...');

			// 调用API处理音频
			const aiResponse = await this.dashScopeClient.processAudio(
				audioBlob, 
				this.settings.promptTemplate
			);

			// 计算处理时间
			const processingDuration = Date.now() - processingStartTime;
			const recordingDuration = processingStartTime - this.recordingStartTime;

			// 创建笔记元数据
			const metadata: NoteMetadata = {
				title: this.noteGenerator.extractTitleFromContent(aiResponse),
				timestamp: new Date(),
				duration: this.noteGenerator.formatDuration(recordingDuration),
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
				const fileName = this.noteGenerator.generateFileName('语音笔记', metadata.timestamp);
				const savedFile = await this.noteGenerator.saveNote(
					noteContent,
					this.settings.outputFolder,
					fileName
				);
				
				new Notice(`笔记已保存: ${savedFile.name}`);
			} else {
				// 如果不自动保存，可以显示预览或提示用户手动保存
				new Notice('音频处理完成，请手动保存笔记');
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