import { ItemView, WorkspaceLeaf, ButtonComponent, Notice } from 'obsidian';
import GetNotePlugin from '../main';
import { AudioRecorder } from './recorder';
import { ImageManager, ImageItem } from './image-manager';
import { ExtendedRecordingState } from './types';

export const VIEW_TYPE_RECORDING = 'getnote-recording-view';

export type RecordingState = ExtendedRecordingState;
export type CloseReason = 'normal' | 'cancelled' | 'manual';

export class RecordingView extends ItemView {
    private plugin: GetNotePlugin;
    private audioRecorder: AudioRecorder | null = null;
    private imageManager: ImageManager;
    private state: RecordingState = 'idle';
    private timerInterval: number | null = null;
    
    // UI Elements
    private statusContainer: HTMLElement;
    private statusDot: HTMLElement;
    private statusText: HTMLElement;
    private timeDisplay: HTMLElement;
    private startButton: ButtonComponent;
    private pauseButton: ButtonComponent;
    private stopButton: ButtonComponent;
    private hintText: HTMLElement;
    
    // Callbacks
    private onRecordingComplete: (audioBlob: Blob, images?: ImageItem[]) => Promise<void>;
    private onError: (error: Error) => void;
    private onCancel?: () => void;
    
    // Processing state
    private enableLLMProcessing: boolean = false;
    private enableImageOCR: boolean = false;
    private enableWakeLock: boolean = true;
    
    // 图片状态
    private images: ImageItem[] = [];

    constructor(
        leaf: WorkspaceLeaf, 
        plugin: GetNotePlugin,
        onRecordingComplete: (audioBlob: Blob, images?: ImageItem[]) => Promise<void>,
        onError: (error: Error) => void,
        enableLLMProcessing: boolean = false,
        enableImageOCR: boolean = false,
        onCancel?: () => void,
        enableWakeLock: boolean = true
    ) {
        super(leaf);
        this.plugin = plugin;
        this.onRecordingComplete = onRecordingComplete;
        this.onError = onError;
        this.enableLLMProcessing = enableLLMProcessing;
        this.enableImageOCR = enableImageOCR;
        this.onCancel = onCancel;
        this.enableWakeLock = enableWakeLock;
        
        this.imageManager = new ImageManager();
    }

    getViewType() { 
        return VIEW_TYPE_RECORDING; 
    }
    
    getDisplayText() { 
        return '语音录制'; 
    }
    
    getIcon() { 
        return 'microphone'; 
    }

    async onOpen() {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        
        // 设置样式
        root.addClass('recording-modal'); // 复用原样式
        
        // 创建主容器
        const container = root.createDiv('simple-recording-container');
        
        // 标题
        const title = container.createEl('h2', { text: '语音录制' });
        title.addClass('simple-recording-title');
        
        // 状态指示器
        this.statusContainer = container.createDiv('simple-status');
        this.statusContainer.addClass('status-idle');
        this.statusDot = this.statusContainer.createDiv('status-dot');
        this.statusText = this.statusContainer.createEl('span', { text: '准备录音' });
        this.statusText.addClass('status-text');
        
        // 时间显示
        this.timeDisplay = container.createEl('div', { text: '00:00' });
        this.timeDisplay.addClass('simple-time');
        
        // 按钮组
        const buttonGroup = container.createDiv('simple-buttons');
        
        // 开始按钮
        const startButtonEl = buttonGroup.createEl('button');
        startButtonEl.addClass('start-btn');
        this.startButton = new ButtonComponent(startButtonEl)
            .setButtonText('开始录音')
            .onClick(() => this.handleStart());
        
        // 暂停按钮
        const pauseButtonEl = buttonGroup.createEl('button');
        pauseButtonEl.addClass('pause-btn');
        this.pauseButton = new ButtonComponent(pauseButtonEl)
            .setButtonText('暂停')
            .setDisabled(true)
            .onClick(() => this.handlePause());
        
        // 停止按钮
        const stopButtonEl = buttonGroup.createEl('button');
        stopButtonEl.addClass('stop-btn');
        this.stopButton = new ButtonComponent(stopButtonEl)
            .setButtonText('停止')
            .setDisabled(true)
            .onClick(() => this.handleStop());
        
        // 提示文字
        const hintText = this.enableLLMProcessing 
            ? '点击开始录音，完成后将进行AI转录和文本优化'
            : '点击开始录音，录音完成后将自动转换为文字笔记';
        this.hintText = container.createEl('div', { text: hintText });
        this.hintText.addClass('simple-hint');
        
        // 设置初始状态
        this.updateUI();
    }

    async onClose() {
        this.performCleanup();
    }

    private performCleanup(): void {
        // 停止并释放录音器
        if (this.audioRecorder) {
            this.audioRecorder.stopRecording();
            this.audioRecorder = null;
        }

        // 停止定时器
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // 清理图片资源
        this.images.forEach(image => {
            if (image.thumbnailDataUrl && image.thumbnailDataUrl.startsWith('blob:')) {
                URL.revokeObjectURL(image.thumbnailDataUrl);
            }
            if (image.originalDataUrl && image.originalDataUrl.startsWith('blob:')) {
                URL.revokeObjectURL(image.originalDataUrl);
            }
        });
        this.images = [];
    }

    private async handleStart(): Promise<void> {
        try {
            if (this.state === 'idle') {
                // 创建录音器
                this.audioRecorder = new AudioRecorder(
                    (blob) => { /* 数据回调在 stop 时处理 */ },
                    (error) => this.onError(error),
                    {
                        enableWakeLock: this.enableWakeLock
                    }
                );

                await this.audioRecorder.startRecording();
                this.setRecordingState('recording');
                this.startTimer();
                new Notice('开始录音...');

            } else if (this.state === 'paused') {
                if (this.audioRecorder) {
                    await this.audioRecorder.resumeRecording();
                    this.setRecordingState('recording');
                    this.startTimer();
                    new Notice('继续录音...');
                }
            }
        } catch (error) {
            console.error('开始录音失败:', error);
            this.onError(error as Error);
        }
    }

    private async handlePause(): Promise<void> {
        try {
            if (this.state === 'recording' && this.audioRecorder) {
                await this.audioRecorder.pauseRecording();
                this.setRecordingState('paused');
                this.stopTimer();
                new Notice('录音已暂停');
            }
        } catch (error) {
            console.error('暂停录音失败:', error);
            this.onError(error as Error);
        }
    }

    private async handleStop(): Promise<void> {
        try {
            if (this.audioRecorder && (this.state === 'recording' || this.state === 'paused')) {
                // 设置一个临时回调来处理录音完成
                const originalRecorder = this.audioRecorder;
                originalRecorder.stopRecording();
                
                // 等待一小段时间让录音器完成处理
                setTimeout(async () => {
                    // 这里我们需要获取录音数据
                    // 由于 AudioRecorder 设计的限制，我们通过插件直接处理
                    await this.onRecordingComplete(new Blob(), this.images.length > 0 ? this.images : undefined);
                }, 100);
                
                this.setRecordingState('idle');
                this.stopTimer();
                
                // 重置UI状态
                this.resetUI();
                new Notice('录音完成');
            }
        } catch (error) {
            console.error('停止录音失败:', error);
            this.onError(error as Error);
        }
    }

    public setRecordingState(newState: RecordingState): void {
        this.state = newState;
        this.updateUI();
    }

    private updateUI(): void {
        // 更新按钮状态
        switch (this.state) {
            case 'idle':
                this.startButton.setButtonText('🎤 开始录音').setDisabled(false);
                this.pauseButton.setButtonText('⏸️ 暂停').setDisabled(true);
                this.stopButton.setButtonText('⏹️ 停止').setDisabled(true);
                this.statusText.textContent = '准备录音';
                this.statusContainer.className = 'simple-status status-idle';
                this.timeDisplay.removeClass('recording');
                break;
            case 'recording':
                this.startButton.setButtonText('🎤 录音中').setDisabled(true);
                this.pauseButton.setButtonText('⏸️ 暂停').setDisabled(false);
                this.stopButton.setButtonText('⏹️ 停止').setDisabled(false);
                this.statusText.textContent = '正在录音...';
                this.statusContainer.className = 'simple-status status-recording';
                this.timeDisplay.addClass('recording');
                break;
            case 'paused':
                this.startButton.setButtonText('▶️ 继续录音').setDisabled(false);
                this.pauseButton.setButtonText('⏸️ 已暂停').setDisabled(true);
                this.stopButton.setButtonText('⏹️ 停止').setDisabled(false);
                this.statusText.textContent = '录音已暂停';
                this.statusContainer.className = 'simple-status status-paused';
                this.timeDisplay.removeClass('recording');
                break;
        }
    }

    /**
     * 更新处理状态（供外部调用）
     */
    public updateProcessingState(state: 'saving-audio' | 'transcribing' | 'ocr-processing' | 'processing' | 'saving') {
        const statusMap = {
            'saving-audio': {
                text: '保存音频...',
                hint: '正在保存音频文件，请稍候...'
            },
            'transcribing': {
                text: '正在转录...',
                hint: '正在将语音转换为文字，请稍候...'
            },
            'ocr-processing': {
                text: '图片识别中...',
                hint: '正在识别图片中的文字内容，请稍候...'
            },
            'processing': {
                text: 'AI处理中...',
                hint: '正在使用AI优化文本内容和生成标签，请稍候...'
            },
            'saving': {
                text: '保存中...',
                hint: '正在保存笔记到您的库中...'
            }
        };

        const status = statusMap[state];
        if (status) {
            this.statusText.textContent = status.text;
            this.hintText.textContent = status.hint;
            this.statusContainer.className = 'simple-status status-processing';
        }
    }

    private startTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        let seconds = 0;
        this.timerInterval = window.setInterval(() => {
            seconds++;
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            this.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    private stopTimer(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    private resetUI(): void {
        this.setRecordingState('idle');
        this.timeDisplay.textContent = '00:00';
        this.images = [];
    }

    /**
     * 紧急关闭方法 - 供外部调用
     */
    public emergencyClose(): void {
        this.leaf.detach();
    }
} 