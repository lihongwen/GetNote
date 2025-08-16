import { Modal, App, ButtonComponent, Notice } from 'obsidian';
import { AudioRecorder } from './recorder';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'saving-audio' | 'transcribing' | 'processing' | 'saving';
export type CloseReason = 'normal' | 'cancelled' | 'manual';

export class RecordingModal extends Modal {
    private audioRecorder: AudioRecorder | null = null;
    private state: RecordingState = 'idle';
    private timerInterval: number | null = null;
    private closeReason: CloseReason = 'manual'; // 默认为手动关闭
    
    // UI Elements - 简化设计
    private statusContainer: HTMLElement;
    private statusDot: HTMLElement;
    private statusText: HTMLElement;
    private timeDisplay: HTMLElement;
    private startButton: ButtonComponent;
    private pauseButton: ButtonComponent;
    private stopButton: ButtonComponent;
    private cancelButton: ButtonComponent;
    private hintText: HTMLElement;
    
    // Callbacks
    private onRecordingComplete: (audioBlob: Blob) => Promise<void>;
    private onError: (error: Error) => void;
    private onCancel?: () => void; // 新增取消回调
    
    // Processing state
    private enableLLMProcessing: boolean = false;
    
    // Cancel confirmation and protection mechanism
    private isClosing: boolean = false;
    private isDestroying: boolean = false;
    private hasNotifiedCancel: boolean = false;
    private closeCallCount: number = 0;
    private destroyTimeout: number | null = null;

    constructor(
        app: App, 
        onRecordingComplete: (audioBlob: Blob) => Promise<void>,
        onError: (error: Error) => void,
        enableLLMProcessing: boolean = false,
        onCancel?: () => void
    ) {
        super(app);
        this.onRecordingComplete = onRecordingComplete;
        this.onError = onError;
        this.enableLLMProcessing = enableLLMProcessing;
        this.onCancel = onCancel;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 设置Modal样式
        contentEl.addClass('recording-modal');
        
        // 创建主容器
        const container = contentEl.createDiv('simple-recording-container');
        
        // 标题
        const title = container.createEl('h2', { text: '🎙️ 语音录制' });
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
            .setButtonText('🎤 开始录音')
            .onClick(() => this.handleStart());
        
        // 暂停按钮
        const pauseButtonEl = buttonGroup.createEl('button');
        pauseButtonEl.addClass('pause-btn');
        this.pauseButton = new ButtonComponent(pauseButtonEl)
            .setButtonText('⏸️ 暂停')
            .setDisabled(true)
            .onClick(() => this.handlePause());
        
        // 停止按钮
        const stopButtonEl = buttonGroup.createEl('button');
        stopButtonEl.addClass('stop-btn');
        this.stopButton = new ButtonComponent(stopButtonEl)
            .setButtonText('⏹️ 停止')
            .setDisabled(true)
            .onClick(() => this.handleStop());

        // 取消按钮
        const cancelButtonEl = buttonGroup.createEl('button');
        cancelButtonEl.addClass('cancel-btn');
        this.cancelButton = new ButtonComponent(cancelButtonEl)
            .setButtonText('❌ 取消')
            .onClick(() => this.handleCancel());
        
        // 提示文字
        const hintText = this.enableLLMProcessing 
            ? '点击开始录音，完成后将进行AI转录和文本优化'
            : '点击开始录音，录音完成后将自动转换为文字笔记';
        this.hintText = container.createEl('div', { text: hintText });
        this.hintText.addClass('simple-hint');
        
        // 设置初始状态
        this.updateUI();
    }

    onClose() {
        console.log(`[SAFE] Modal onClose 被调用，状态: ${this.state}, 原因: ${this.closeReason}, isDestroying: ${this.isDestroying}`);
        
        // 第一层防护：防止重复执行
        if (this.isDestroying) {
            console.log('[SAFE] Modal已在销毁过程中，跳过onClose处理');
            return;
        }

        // 立即设置销毁状态，防止重复调用
        this.isDestroying = true;
        
        try {
            // 只做资源清理工作，不做任何关闭操作
            this.performCleanup();
            
            // 如果需要确认且还没确认，则显示确认对话框
            if (this.shouldConfirmClose() && this.closeReason !== 'normal') {
                console.log('[SAFE] 需要用户确认，显示确认对话框');
                // 重置销毁状态，允许用户选择
                this.isDestroying = false;
                this.showCloseConfirmation();
                return;
            }
            
            // 通知取消（如果需要）
            this.notifyCancellation();
            
            console.log('[SAFE] Modal onClose 清理完成');
        } catch (error) {
            console.error('[SAFE] Modal onClose 清理时出错:', error);
        }
    }

    /**
     * 检查是否需要确认关闭
     */
    private shouldConfirmClose(): boolean {
        // 如果已经在关闭过程中，不需要确认
        if (this.isClosing) {
            return false;
        }

        // 正常完成不需要确认
        if (this.closeReason === 'normal') {
            return false;
        }

        // idle状态不需要确认
        if (this.state === 'idle') {
            return false;
        }

        // 用户取消或手动关闭时，根据状态判断是否需要确认
        return this.state === 'recording' || 
               this.state === 'paused' || 
               this.state === 'saving-audio' ||
               this.state === 'transcribing' || 
               this.state === 'processing' || 
               this.state === 'saving';
    }

    /**
     * 显示关闭确认对话框
     */
    private showCloseConfirmation(): void {
        const message = this.getConfirmationMessage();
        
        // 使用异步方式显示确认对话框，避免阻塞调用栈
        setTimeout(() => {
            const confirmed = confirm(message);
            
            if (confirmed) {
                console.log('[SAFE] 用户确认关闭，执行安全关闭流程');
                this.safeClose();
            } else {
                console.log('[SAFE] 用户取消关闭确认，继续当前状态');
                // 重置状态，允许继续操作
                this.isDestroying = false;
                this.closeReason = 'manual';
            }
        }, 10);
    }

    /**
     * 根据当前状态获取确认消息
     */
    private getConfirmationMessage(): string {
        switch (this.state) {
            case 'recording':
            case 'paused':
                return '确定要取消录音吗？\n\n录音内容将会丢失，无法恢复。';
            
            case 'saving-audio':
                return '正在保存音频文件，确定要取消吗？\n\n录音和音频文件将会丢失。';
            
            case 'transcribing':
                return '正在转录音频，确定要取消吗？\n\n已录制的内容将会丢失。';
            
            case 'processing':
                return '正在处理录音，确定要取消吗？\n\n已录制和转录的内容将会丢失。';
            
            case 'saving':
                return '正在保存笔记，确定要取消吗？\n\n处理完成的内容可能会丢失。';
            
            default:
                return '确定要关闭录音界面吗？';
        }
    }

    /**
     * 安全关闭Modal - 使用异步机制防止递归
     */
    private safeClose(): void {
        console.log(`[SAFE] safeClose 被调用，closeCallCount: ${this.closeCallCount}`);
        
        // 第二层防护：递归检测
        this.closeCallCount++;
        if (this.closeCallCount > 3) {
            console.error('[SAFE] 检测到过多关闭调用，强制中断');
            this.forceDestroy();
            return;
        }
        
        // 第一层防护：使用 setTimeout 打破调用栈
        if (this.destroyTimeout) {
            clearTimeout(this.destroyTimeout);
        }
        
        this.destroyTimeout = window.setTimeout(() => {
            try {
                console.log('[SAFE] 异步执行Modal关闭');
                
                // 设置关闭状态
                this.isClosing = true;
                this.isDestroying = true;
                
                // 执行最终的清理和通知
                this.performFinalCleanup();
                
                // 使用原生DOM方法关闭，避免触发onClose
                this.containerEl.remove();
                
                console.log('[SAFE] Modal已安全关闭');
            } catch (error) {
                console.error('[SAFE] 安全关闭过程中出错:', error);
                this.forceDestroy();
            }
        }, 0);
    }

    /**
     * 强制销毁Modal（紧急情况使用）
     */
    private forceDestroy(): void {
        console.log('[SAFE] 强制销毁Modal');
        try {
            this.isClosing = true;
            this.isDestroying = true;
            
            // 清理所有定时器
            if (this.destroyTimeout) {
                clearTimeout(this.destroyTimeout);
                this.destroyTimeout = null;
            }
            
            // 强制清理资源
            this.performCleanup();
            
            // 直接移除DOM元素
            if (this.containerEl && this.containerEl.parentNode) {
                this.containerEl.parentNode.removeChild(this.containerEl);
            }
        } catch (error) {
            console.error('[SAFE] 强制销毁时出错:', error);
        }
    }

    /**
     * 执行最终清理（包含通知）
     */
    private performFinalCleanup(): void {
        // 通知外部取消处理
        this.notifyCancellation();
        
        // 执行基础清理
        this.performCleanup();
    }

    /**
     * 通知外部取消当前处理
     */
    private notifyCancellation(): void {
        console.log(`取消录音，当前状态: ${this.state}, 关闭原因: ${this.closeReason}`);
        
        // 防止重复通知
        if (this.hasNotifiedCancel) {
            console.log('已通知取消，跳过重复调用');
            return;
        }
        
        // 只在用户主动取消时调用取消回调
        if (this.closeReason === 'cancelled' && this.onCancel) {
            console.log('调用取消回调通知主程序');
            this.hasNotifiedCancel = true;
            this.onCancel();
        } else {
            console.log('非用户主动取消，跳过取消回调');
        }
    }

    /**
     * 执行资源清理
     */
    private performCleanup(): void {
        // 清理定时器
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // 清理销毁定时器
        if (this.destroyTimeout) {
            clearTimeout(this.destroyTimeout);
            this.destroyTimeout = null;
        }
        
        // 如果正在录音，先停止
        if (this.audioRecorder && this.audioRecorder.getRecordingState()) {
            console.log('停止录音...');
            this.audioRecorder.stopRecording();
        }
        
        // 清理录音器引用
        this.audioRecorder = null;
        
        // 重置状态
        this.state = 'idle';
        this.isClosing = false;
        this.closeReason = 'manual'; // 重置关闭原因
        this.hasNotifiedCancel = false; // 重置取消通知标志
        this.closeCallCount = 0; // 重置调用计数器
    }

    private async handleStart() {
        try {
            if (this.state === 'paused') {
                // 继续录音
                this.audioRecorder?.resumeRecording();
                this.setState('recording');
                new Notice('继续录音...');
            } else {
                // 开始新录音
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
                
                // 启动定时器
                this.startTimer();
                
                new Notice('开始录音...');
            }
        } catch (error) {
            this.setState('idle');
            this.onError(error as Error);
        }
    }

    private handlePause() {
        if (!this.audioRecorder) return;
        
        this.audioRecorder.pauseRecording();
        this.setState('paused');
        new Notice('录音已暂停');
    }

    private async handleStop() {
        if (this.audioRecorder && this.audioRecorder.getRecordingState()) {
            this.audioRecorder.stopRecording();
            // 录音完成后会自动调用 handleRecordingComplete
        }
    }

    private handleCancel() {
        console.log('[SAFE] 用户点击取消按钮');
        // 设置为用户取消，需要确认对话框
        this.closeReason = 'cancelled';
        // 直接触发关闭确认流程
        this.showCloseConfirmation();
    }

    private async handleRecordingComplete(audioBlob: Blob) {
        try {
            // 停止定时器
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            // 设置为正常完成，不需要确认对话框
            this.closeReason = 'normal';
            
            // 注意：不在这里设置transcribing状态，因为可能需要先保存音频
            // 状态将由main.ts中的处理流程控制
            
            // 调用回调处理录音数据
            await this.onRecordingComplete(audioBlob);
            
            // 完成后安全关闭Modal
            this.safeClose();
            
        } catch (error) {
            this.setState('idle');
            this.onError(error as Error);
        }
    }

    private handleRecordingError(error: Error) {
        console.log('[SAFE] 录音错误，重置状态');
        this.setState('idle');
        
        // 错误恢复：重置所有保护状态
        this.isClosing = false;
        this.isDestroying = false;
        this.hasNotifiedCancel = false;
        this.closeCallCount = 0;
        
        // 清理定时器
        if (this.destroyTimeout) {
            clearTimeout(this.destroyTimeout);
            this.destroyTimeout = null;
        }
        
        this.onError(error);
    }

    private setState(newState: RecordingState) {
        this.state = newState;
        this.updateUI();
    }

    private updateUI() {
        // 移除所有状态类
        this.statusContainer.removeClass('status-idle', 'status-recording', 'status-paused');
        this.timeDisplay.removeClass('recording');
        
        // 根据状态更新UI
        switch (this.state) {
            case 'idle':
                this.statusContainer.addClass('status-idle');
                this.statusText.textContent = '准备录音';
                this.hintText.textContent = this.enableLLMProcessing 
                    ? '点击开始录音，完成后将进行AI转录和文本优化'
                    : '点击开始录音，录音完成后将自动转换为文字笔记';
                
                // 按钮状态
                this.startButton.setDisabled(false).setButtonText('🎤 开始录音');
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                this.cancelButton.setDisabled(true);
                break;
                
            case 'recording':
                this.statusContainer.addClass('status-recording');
                this.statusText.textContent = '正在录音...';
                this.timeDisplay.addClass('recording');
                this.hintText.textContent = '正在录音中，可以暂停或停止录音';
                
                // 按钮状态
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(false);
                this.stopButton.setDisabled(false);
                this.cancelButton.setDisabled(false);
                break;
                
            case 'paused':
                this.statusContainer.addClass('status-paused');
                this.statusText.textContent = '录音已暂停';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '录音已暂停，可以继续录音或停止录音';
                
                // 按钮状态
                this.startButton.setDisabled(false).setButtonText('▶️ 继续录音');
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(false);
                this.cancelButton.setDisabled(false);
                break;
                
            case 'saving-audio':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = '💾 保存音频...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在保存音频文件，请稍候...';
                
                // 禁用所有按钮
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                this.cancelButton.setDisabled(false).setButtonText('❌ 取消');
                break;
                
            case 'transcribing':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = '🔄 正在转录...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在将语音转换为文字，请稍候...';
                
                // 禁用所有按钮
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                this.cancelButton.setDisabled(false).setButtonText('❌ 取消');
                break;
                
            case 'processing':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = '🤖 AI处理中...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在使用AI优化文本内容和生成标签，请稍候...';
                
                // 禁用功能按钮，保留取消按钮
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                this.cancelButton.setDisabled(false).setButtonText('❌ 取消');
                break;
                
            case 'saving':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = '💾 保存中...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在保存笔记到您的库中...';
                
                // 保存阶段仍可取消，但风险更高
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                this.cancelButton.setDisabled(false).setButtonText('❌ 取消');
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

    // 公共方法：允许外部更新处理状态
    public updateProcessingState(state: 'saving-audio' | 'transcribing' | 'processing' | 'saving') {
        this.setState(state);
    }
} 