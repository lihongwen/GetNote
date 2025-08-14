import { Modal, App, ButtonComponent, Notice } from 'obsidian';
import { AudioRecorder } from './recorder';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';

export class RecordingModal extends Modal {
    private audioRecorder: AudioRecorder | null = null;
    private state: RecordingState = 'idle';
    private timerInterval: number | null = null;
    
    // UI Elements
    private statusIndicator: HTMLElement;
    private timeDisplay: HTMLElement;
    private startButton: ButtonComponent;
    private pauseButton: ButtonComponent;
    private stopButton: ButtonComponent;
    private statusText: HTMLElement;
    
    // Callbacks
    private onRecordingComplete: (audioBlob: Blob) => Promise<void>;
    private onError: (error: Error) => void;

    constructor(
        app: App, 
        onRecordingComplete: (audioBlob: Blob) => Promise<void>,
        onError: (error: Error) => void
    ) {
        super(app);
        this.onRecordingComplete = onRecordingComplete;
        this.onError = onError;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 设置Modal标题和样式
        contentEl.addClass('recording-modal');
        
        // 创建主容器
        const container = contentEl.createDiv('recording-container');
        
        // 标题
        const title = container.createEl('h2', { text: '🎙️ 语音录制' });
        title.addClass('recording-title');
        
        // 状态指示器容器
        const statusContainer = container.createDiv('status-container');
        
        // 录音状态指示器（圆形指示灯）
        this.statusIndicator = statusContainer.createDiv('status-indicator');
        this.statusIndicator.addClass('status-idle');
        
        // 状态文本
        this.statusText = statusContainer.createEl('div', { text: '准备录音' });
        this.statusText.addClass('status-text');
        
        // 时间显示
        this.timeDisplay = container.createEl('div', { text: '00:00' });
        this.timeDisplay.addClass('time-display');
        
        // 按钮容器
        const buttonContainer = container.createDiv('button-container');
        
        // 开始录音按钮
        const startButtonEl = buttonContainer.createEl('button');
        this.startButton = new ButtonComponent(startButtonEl)
            .setButtonText('🎤 开始录音')
            .setCta()
            .onClick(() => this.handleStart());
        
        // 暂停/恢复按钮
        const pauseButtonEl = buttonContainer.createEl('button');
        this.pauseButton = new ButtonComponent(pauseButtonEl)
            .setButtonText('⏸️ 暂停')
            .setDisabled(true)
            .onClick(() => this.handlePause());
        
        // 停止按钮
        const stopButtonEl = buttonContainer.createEl('button');
        this.stopButton = new ButtonComponent(stopButtonEl)
            .setButtonText('⏹️ 停止')
            .setDisabled(true)
            .onClick(() => this.handleStop());
        
        // 提示信息
        const hintText = container.createEl('div', { 
            text: '点击开始录音，录音完成后将自动转换为文字笔记' 
        });
        hintText.addClass('hint-text');
        
        // 设置初始状态
        this.updateUI();
    }

    onClose() {
        // 清理定时器
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // 如果正在录音，先停止
        if (this.audioRecorder && this.audioRecorder.getRecordingState()) {
            this.audioRecorder.stopRecording();
        }
        
        this.audioRecorder = null;
    }

    private async handleStart() {
        try {
            this.setState('recording');
            
            // 检查麦克风权限
            const hasPermission = await AudioRecorder.checkMicrophonePermission();
            if (!hasPermission) {
                throw new Error('需要麦克风权限才能录音');
            }
            
            // 创建录音器
            this.audioRecorder = new AudioRecorder(
                (audioBlob) => this.handleRecordingComplete(audioBlob),
                (error) => this.handleRecordingError(error)
            );
            
            await this.audioRecorder.startRecording();
            
            // 启动定时器更新时间显示
            this.startTimer();
            
            new Notice('开始录音...');
            
        } catch (error) {
            this.setState('idle');
            this.onError(error as Error);
        }
    }

    private handlePause() {
        if (!this.audioRecorder) return;
        
        if (this.state === 'recording') {
            this.audioRecorder.pauseRecording();
            this.setState('paused');
            new Notice('录音已暂停');
        } else if (this.state === 'paused') {
            this.audioRecorder.resumeRecording();
            this.setState('recording');
            new Notice('继续录音...');
        }
    }

    private async handleStop() {
        if (this.audioRecorder && this.audioRecorder.getRecordingState()) {
            this.setState('processing');
            this.audioRecorder.stopRecording();
            // 录音完成后会自动调用 handleRecordingComplete
        }
    }

    private async handleRecordingComplete(audioBlob: Blob) {
        try {
            // 停止定时器
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            // 关闭Modal
            this.close();
            
            // 调用回调处理录音数据
            await this.onRecordingComplete(audioBlob);
            
        } catch (error) {
            this.setState('idle');
            this.onError(error as Error);
        }
    }

    private handleRecordingError(error: Error) {
        this.setState('idle');
        this.onError(error);
    }

    private setState(newState: RecordingState) {
        this.state = newState;
        this.updateUI();
    }

    private updateUI() {
        // 更新状态指示器
        this.statusIndicator.className = 'status-indicator';
        
        // 更新按钮状态和文本
        switch (this.state) {
            case 'idle':
                this.statusIndicator.addClass('status-idle');
                this.statusText.textContent = '准备录音';
                this.startButton.setDisabled(false).setButtonText('🎤 开始录音');
                this.pauseButton.setDisabled(true).setButtonText('⏸️ 暂停');
                this.stopButton.setDisabled(true).setButtonText('⏹️ 停止');
                break;
                
            case 'recording':
                this.statusIndicator.addClass('status-recording');
                this.statusText.textContent = '正在录音...';
                this.startButton.setDisabled(true).setButtonText('🎤 录音中');
                this.pauseButton.setDisabled(false).setButtonText('⏸️ 暂停');
                this.stopButton.setDisabled(false).setButtonText('⏹️ 停止');
                break;
                
            case 'paused':
                this.statusIndicator.addClass('status-paused');
                this.statusText.textContent = '录音已暂停';
                this.startButton.setDisabled(true).setButtonText('🎤 录音中');
                this.pauseButton.setDisabled(false).setButtonText('▶️ 继续');
                this.stopButton.setDisabled(false).setButtonText('⏹️ 停止');
                break;
                
            case 'processing':
                this.statusIndicator.addClass('status-processing');
                this.statusText.textContent = '处理中...';
                this.startButton.setDisabled(true).setButtonText('🎤 处理中');
                this.pauseButton.setDisabled(true).setButtonText('⏸️ 暂停');
                this.stopButton.setDisabled(true).setButtonText('⏹️ 处理中');
                break;
        }
    }

    private startTimer() {
        this.timerInterval = window.setInterval(() => {
            if (this.audioRecorder) {
                const duration = this.audioRecorder.getRecordingDuration();
                this.timeDisplay.textContent = this.formatTime(duration);
            }
        }, 100); // 每100ms更新一次
    }

    private formatTime(milliseconds: number): string {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
} 