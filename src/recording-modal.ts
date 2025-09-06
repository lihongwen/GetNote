import { Modal, App, ButtonComponent, Notice } from 'obsidian';
import { AudioRecorder } from './recorder';
import { ImageManager, ImageItem } from './image-manager';
import { ExtendedRecordingState, OCRProgress, ImageComponentState } from './types';

export type RecordingState = ExtendedRecordingState;
export type CloseReason = 'normal' | 'cancelled' | 'manual';

export class RecordingModal extends Modal {
    private audioRecorder: AudioRecorder | null = null;
    private imageManager: ImageManager;
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
    private hintText: HTMLElement;
    
    // Wake Lock状态显示
    private wakeLockIndicator: HTMLElement;
    private wakeLockText: HTMLElement;
    
    
    // 图片相关UI元素
    private imageSection: HTMLElement;
    private imageUploadArea: HTMLElement;
    private imageGrid: HTMLElement;
    private imageFileInput: HTMLInputElement;
    private imageProgress: HTMLElement;
    private ocrProgress: HTMLElement;
    
    // Callbacks
    private onRecordingComplete: (audioBlob: Blob, images?: ImageItem[]) => Promise<void>;
    private onError: (error: Error) => void;
    private onCancel?: () => void; // 新增取消回调
    
    // Processing state
    private enableLLMProcessing: boolean = false;
    private enableImageOCR: boolean = false;
    private enableWakeLock: boolean = true;
    
    // 图片组件状态
    private imageState: ImageComponentState = {
        images: [],
        selectedImages: new Set(),
        dragActive: false,
        uploadProgress: new Map(),
        ocrProgress: null,
        showPreview: false,
        previewImageId: null
    };
    
    // Cancel confirmation and protection mechanism
    // 简化的关闭状态管理
    private isProcessingClose: boolean = false;

    constructor(
        app: App, 
        onRecordingComplete: (audioBlob: Blob, images?: ImageItem[]) => Promise<void>,
        onError: (error: Error) => void,
        enableLLMProcessing: boolean = false,
        enableImageOCR: boolean = false,
        onCancel?: () => void,
        enableWakeLock: boolean = true
    ) {
        super(app);
        this.onRecordingComplete = onRecordingComplete;
        this.onError = onError;
        this.enableLLMProcessing = enableLLMProcessing;
        this.enableImageOCR = enableImageOCR;
        this.onCancel = onCancel;
        this.enableWakeLock = enableWakeLock;
        
        // 初始化图片管理器
        this.imageManager = new ImageManager();
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 设置Modal样式
        contentEl.addClass('recording-modal');
        
        // 创建主容器
        const container = contentEl.createDiv('simple-recording-container');
        
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
        
        // Wake Lock状态指示器
        this.wakeLockIndicator = container.createDiv('wake-lock-indicator');
        this.wakeLockIndicator.addClass('hidden'); // 初始隐藏
        const wakeLockIcon = this.wakeLockIndicator.createDiv('wake-lock-icon');
        wakeLockIcon.setText('🔒');
        this.wakeLockText = this.wakeLockIndicator.createEl('span', { text: '防锁屏已激活' });
        this.wakeLockText.addClass('wake-lock-text');
        
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
        
        // 图片区域 (仅在启用OCR时显示)
        if (this.enableImageOCR) {
            this.createImageSection(container);
        }
        
        // iOS特定优化
        this.optimizeForIOS();
        
        // 设置初始状态
        this.updateUI();
    }



    
    /**
     * 打开插件设置
     */
    private openPluginSettings(): void {
        // 先关闭当前模态框
        this.closeReason = 'normal';
        this.close();
        
        // 打开Obsidian设置页面并导航到插件配置
        setTimeout(() => {
            (this.app as any).setting?.open();
            (this.app as any).setting?.openTabById('getnote-plugin');
        }, 100);
    }

    /**
     * 简化的关闭请求处理
     */
    private requestClose(): void {
        if (this.isProcessingClose) {
            return;
        }
        
        if (this.shouldConfirmClose()) {
            this.showSimpleConfirmation();
        } else {
            this.close();
        }
    }

    onClose() {
        if (this.isProcessingClose) {
            return;
        }
        
        this.isProcessingClose = true;
        
        try {
            
            // 执行清理
            this.performCleanup();
            
            // 通知取消（如果需要）
            if (this.closeReason === 'cancelled' && this.onCancel) {
                this.onCancel();
            }
        } catch (error) {
            console.error('Modal 溅理时出错:', error);
        }
    }

    /**
     * 简化的关闭确认检查
     */
    private shouldConfirmClose(): boolean {
        // idle状态或正常完成不需要确认
        if (this.state === 'idle' || this.closeReason === 'normal') {
            return false;
        }
        
        // 正在录音、暂停或处理中需要确认
        const needsConfirm = [
            'recording', 'paused', 'saving-audio', 
            'transcribing', 'ocr-processing', 'processing', 'saving'
        ].includes(this.state);
        
        return needsConfirm;
    }

    /**
     * 显示简化的确认对话框
     */
    private showSimpleConfirmation(): void {
        const message = this.getConfirmationMessage();
        
        if (confirm(message)) {
            this.close();
        } else {
            this.closeReason = 'manual';
        }
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
     * 执行资源清理
     */
    private performCleanup(): void {
        // 清理定时器
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        
        // 如果正在录音，先停止
        if (this.audioRecorder && this.audioRecorder.getRecordingState()) {
            this.audioRecorder.stopRecording();
        }
        
        // 清理录音器引用
        this.audioRecorder = null;
        
        // 清理图片相关资源
        if (this.imageManager) {
            console.log('清理图片资源...');
            this.imageManager.clearAllImages();
        }
        
        // 重置图片状态
        this.imageState = {
            images: [],
            selectedImages: new Set(),
            dragActive: false,
            uploadProgress: new Map(),
            ocrProgress: null,
            showPreview: false,
            previewImageId: null
        };
        
        // 重置状态
        this.state = 'idle';
        this.closeReason = 'manual';
    }

    private async handleStart() {
        try {
            if (this.state === 'paused') {
                // 继续录音
                this.audioRecorder?.resumeRecording();
                this.setState('recording');
                new Notice('继续录音...');
            } else {
                // 开始新录音 - 优化iOS交互流程
                
                // 先检查iOS权限状态
                const isIOS = this.detectIOS();
                if (isIOS) {
                    const iosStatus = await AudioRecorder.checkIOSMicrophoneStatus();
                    if (!iosStatus.supported) {
                        throw new Error(`录音功能不受支持: ${iosStatus.error}`);
                    }
                    if (!iosStatus.hasPermission && iosStatus.error) {
                        throw new Error(`麦克风权限问题: ${iosStatus.error}`);
                    }
                }
                
                // 设置状态 - 必须在用户手势触发的函数中
                this.setState('recording');
                
                // 检查麦克风权限
                const hasPermission = await AudioRecorder.checkMicrophonePermission();
                if (!hasPermission) {
                    throw new Error('需要麦克风权限才能录音。请在浏览器设置中允许麦克风访问。');
                }
                
                // 创建录音器 - 确保在用户交互上下文中
                this.audioRecorder = new AudioRecorder(
                    (audioBlob) => this.handleRecordingComplete(audioBlob),
                    (error) => this.handleRecordingError(error),
                    {
                        enableWakeLock: this.enableWakeLock, // 使用设置中的配置
                        onWakeLockChange: (isActive, error) => this.handleWakeLockChange(isActive, error)
                    }
                );
                
                // 启动录音 - 关键：这必须在用户手势事件的调用栈中
                await this.audioRecorder.startRecording();
                
                // 启动定时器
                this.startTimer();
                
                const message = isIOS ? '录音已开始（iOS设备请保持页面活跃）' : '开始录音...';
                new Notice(message);
            }
        } catch (error) {
            this.setState('idle');
            const errorMsg = error instanceof Error ? error.message : '录音启动失败';
            
            // iOS特定错误提示
            if (this.detectIOS() && errorMsg.includes('NotAllowedError')) {
                this.onError(new Error('麦克风权限被拒绝。请在Safari设置中允许此网站访问麦克风，然后重新尝试。'));
            } else {
                this.onError(new Error(errorMsg));
            }
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


    private async handleRecordingComplete(audioBlob: Blob) {
        try {
            // 停止定时器
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            // 设置为正常完成，不需要确认对话框
            this.closeReason = 'normal';
            
            // 获取当前的图片列表
            const images = this.getImages();
            
            // 注意：不在这里设置transcribing状态，因为可能需要先保存音频
            // 状态将由main.ts中的处理流程控制
            
            // 调用回调处理录音数据和图片数据
            await this.onRecordingComplete(audioBlob, images.length > 0 ? images : undefined);
            
            // 完成后直接关闭Modal（正常完成，无需确认）
            this.close();
            
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
                this.startButton.setDisabled(false).setButtonText('开始录音');
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
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
                break;
                
            case 'paused':
                this.statusContainer.addClass('status-paused');
                this.statusText.textContent = '录音已暂停';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '录音已暂停，可以继续录音或停止录音';
                
                // 按钮状态
                this.startButton.setDisabled(false).setButtonText('继续录音');
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(false);
                break;
                
            case 'saving-audio':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = '保存音频...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在保存音频文件，请稍候...';
                
                // 禁用所有按钮
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                break;
                
            case 'transcribing':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = '正在转录...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在将语音转换为文字，请稍候...';
                
                // 禁用所有按钮
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                break;
                
            case 'ocr-processing':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = '图片识别中...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在识别图片中的文字内容，请稍候...';
                
                // 禁用所有按钮
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                break;
                
            case 'processing':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = 'AI处理中...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在使用AI优化文本内容和生成标签，请稍候...';
                
                // 禁用功能按钮，保留取消按钮
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
                break;
                
            case 'saving':
                this.statusContainer.addClass('status-recording'); // 使用录音状态的样式
                this.statusText.textContent = '保存中...';
                this.timeDisplay.removeClass('recording');
                this.hintText.textContent = '正在保存笔记到您的库中...';
                
                // 保存阶段仍可取消，但风险更高
                this.startButton.setDisabled(true);
                this.pauseButton.setDisabled(true);
                this.stopButton.setDisabled(true);
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
    public updateProcessingState(state: 'saving-audio' | 'transcribing' | 'ocr-processing' | 'processing' | 'saving') {
        this.setState(state);
    }

    /**
     * 创建图片区域UI - 整合版本
     */
    private createImageSection(container: HTMLElement): void {
        this.imageSection = container.createDiv('image-section');
        
        // 图片区域标题
        const imageTitle = this.imageSection.createEl('h3', { text: '添加图片' });
        imageTitle.addClass('image-section-title');
        
        // 创建文件输入
        this.imageFileInput = this.imageManager.createFileInput();
        this.imageSection.appendChild(this.imageFileInput);
        
        // 整合的图片区域（添加按钮 + 预览区域）
        this.createIntegratedImageArea();
        
        // 进度显示区域
        this.createProgressAreas();
        
        // 绑定事件
        this.setupImageEvents();
    }

    /**
     * 创建整合的图片区域（添加按钮 + 预览区域）
     */
    private createIntegratedImageArea(): void {
        // 主容器
        const integratedArea = this.imageSection.createDiv('integrated-image-area');
        
        // 添加按钮区域
        const addButtonArea = integratedArea.createDiv('add-button-area');
        const addButton = addButtonArea.createEl('button');
        addButton.addClass('image-add-button');
        addButton.innerHTML = '📷<span>+</span>';
        addButton.title = '添加图片';
        addButton.addEventListener('click', () => {
            this.imageFileInput.click();
        });
        
        // 图片预览区域
        this.imageGrid = integratedArea.createDiv('image-preview-area');
        this.imageGrid.addClass('image-grid', 'integrated-grid');
        
        // 底部提示文字
        const hintText = this.imageSection.createEl('div', { 
            text: '点击+添加图片，支持JPG/PNG/GIF/WebP，最大10MB' 
        });
        hintText.addClass('image-hint-text');
        
        // 保持拖拽功能，将整个区域设为拖拽目标
        this.imageUploadArea = integratedArea; // 复用原有的拖拽区域变量
    }

    /**
     * 创建进度显示区域
     */
    private createProgressAreas(): void {
        // 上传进度
        this.imageProgress = this.imageSection.createDiv('image-progress');
        this.imageProgress.addClass('progress-area');
        this.imageProgress.addClass('hidden');
        
        // OCR进度
        this.ocrProgress = this.imageSection.createDiv('ocr-progress');
        this.ocrProgress.addClass('progress-area');
        this.ocrProgress.addClass('hidden');
    }

    /**
     * 设置图片相关事件
     */
    private setupImageEvents(): void {
        // 文件选择事件
        this.imageFileInput.addEventListener('change', async (event) => {
            const target = event.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                await this.handleImageFiles(target.files);
                target.value = ''; // 清空输入，允许重复选择同一文件
            }
        });

        // 拖拽事件
        this.setupDragAndDrop();
    }

    /**
     * 设置拖拽功能
     */
    private setupDragAndDrop(): void {
        const uploadArea = this.imageUploadArea;

        uploadArea.addEventListener('dragenter', (e) => {
            e.preventDefault();
            this.imageState.dragActive = true;
            uploadArea.addClass('drag-active');
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!uploadArea.contains(e.relatedTarget as Node)) {
                this.imageState.dragActive = false;
                uploadArea.removeClass('drag-active');
            }
        });

        uploadArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            this.imageState.dragActive = false;
            uploadArea.removeClass('drag-active');
            
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                await this.handleImageFiles(files);
            }
        });
    }

    /**
     * 处理选择的图片文件
     */
    private async handleImageFiles(files: FileList): Promise<void> {
        try {
            this.showImageProgress('正在添加图片...');
            
            const result = await this.imageManager.addImagesLegacy(files);
            
            if (result.added.length > 0) {
                // 更新状态
                this.imageState.images = this.imageManager.getAllImages();
                
                // 更新UI
                this.updateImageGrid();
                
                new Notice(`成功添加 ${result.added.length} 张图片`);
            }
            
            if (result.errors.length > 0) {
                console.error('图片添加错误:', result.errors);
                new Notice(`添加图片时出现错误: ${result.errors.slice(0, 2).join(', ')}`);
            }
            
        } catch (error) {
            console.error('处理图片文件失败:', error);
            new Notice('添加图片失败，请重试');
        } finally {
            this.hideImageProgress();
        }
    }

    /**
     * 更新图片网格显示
     */
    private updateImageGrid(): void {
        this.imageGrid.empty();
        
        if (this.imageState.images.length === 0) {
            const emptyHint = this.imageGrid.createEl('div', { text: '还未添加图片' });
            emptyHint.addClass('empty-hint');
            return;
        }

        this.imageState.images.forEach(image => {
            const imageItem = this.createImageItem(image);
            this.imageGrid.appendChild(imageItem);
        });
        
        // 更新计数显示
        this.updateImageCount();
    }

    /**
     * 创建单个图片项
     */
    private createImageItem(image: ImageItem): HTMLElement {
        const itemEl = document.createElement('div');
        itemEl.addClass('image-item');
        itemEl.setAttribute('data-image-id', image.id);
        
        // 缩略图容器
        const thumbnailContainer = itemEl.createDiv('thumbnail-container');
        
        // 缩略图
        const thumbnail = thumbnailContainer.createEl('img', { attr: { src: image.thumbnailDataUrl } });
        thumbnail.addClass('thumbnail');
        thumbnail.alt = image.fileName;
        
        // 删除按钮 - 优化为更明显的样式
        const deleteButton = thumbnailContainer.createEl('button');
        deleteButton.addClass('delete-button');
        deleteButton.addClass('enhanced-delete'); // 新的增强样式类
        deleteButton.innerHTML = '❌'; // 使用更明显的删除图标
        deleteButton.title = '删除图片';
        deleteButton.setAttribute('aria-label', '删除图片');
        
        // 增强的删除功能，包含确认对话框
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleImageDelete(image.id, image.fileName);
        });
        
        // 文件信息
        const infoContainer = itemEl.createDiv('image-info');
        const fileName = infoContainer.createEl('div', { text: image.fileName });
        fileName.addClass('file-name');
        const fileSize = infoContainer.createEl('div', { text: this.formatFileSize(image.fileSize) });
        fileSize.addClass('file-size');
        
        return itemEl;
    }

    /**
     * 处理图片删除 - 增强版本，包含确认对话框
     */
    private handleImageDelete(imageId: string, fileName: string): void {
        // 在手机上使用简化的确认方式
        const isMobile = window.innerWidth <= 768;
        const message = isMobile 
            ? `删除图片"${fileName}"？`
            : `确定要删除图片"${fileName}"吗？\n\n删除后无法恢复。`;
            
        const confirmed = confirm(message);
        
        if (confirmed) {
            this.removeImage(imageId);
        }
    }

    /**
     * 删除图片 - 原有逻辑保持不变
     */
    private removeImage(imageId: string): void {
        const removed = this.imageManager.removeImage(imageId);
        if (removed) {
            this.imageState.images = this.imageManager.getAllImages();
            this.updateImageGrid();
            new Notice('图片已删除');
        }
    }

    /**
     * 显示图片处理进度
     */
    private showImageProgress(message: string): void {
        this.imageProgress.removeClass('hidden');
        this.imageProgress.textContent = message;
    }

    /**
     * 隐藏图片处理进度
     */
    private hideImageProgress(): void {
        this.imageProgress.addClass('hidden');
    }

    /**
     * 显示OCR进度
     */
    private showOCRProgress(progress: OCRProgress): void {
        this.ocrProgress.removeClass('hidden');
        const progressText = `OCR处理中: ${progress.currentFileName} (${progress.currentIndex}/${progress.totalImages})`;
        this.ocrProgress.textContent = progressText;
    }

    /**
     * 隐藏OCR进度
     */
    private hideOCRProgress(): void {
        this.ocrProgress.addClass('hidden');
    }

    /**
     * 更新图片计数显示
     */
    private updateImageCount(): void {
        const count = this.imageState.images.length;
        const title = this.imageSection.querySelector('.image-section-title');
        if (title) {
            title.textContent = count > 0 ? `添加图片 (${count})` : '添加图片';
        }
    }

    /**
     * 格式化文件大小
     */
    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 获取当前图片列表
     */
    public getImages(): ImageItem[] {
        return this.imageManager.getAllImages();
    }

    /**
     * 清空所有图片
     */
    public clearImages(): void {
        this.imageManager.clearAllImages();
        this.imageState.images = [];
        this.updateImageGrid();
    }

    /**
     * 检测是否为iOS设备
     */
    private detectIOS(): boolean {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }


    /**
     * iOS特定的UI优化
     */
    private optimizeForIOS(): void {
        if (!this.detectIOS()) return;

        // 为iOS添加特定的CSS类
        this.contentEl.addClass('ios-optimized');
        
        // 检查Wake Lock支持状态
        const wakeLockSupport = AudioRecorder.checkWakeLockSupport();
        
        // 添加iOS特定的提示信息
        let hintText = 'iOS提示：首次使用请在Safari设置中允许麦克风访问';
        if (wakeLockSupport.isSupported) {
            hintText += '，录音时将自动防止锁屏';
        } else {
            hintText += '，录音时请保持屏幕开启';
        }
        
        const iosHint = this.contentEl.createEl('div', { text: hintText });
        iosHint.addClass('ios-hint');
        
        // 如果不支持Wake Lock，显示额外警告
        if (!wakeLockSupport.isSupported) {
            const warningHint = this.contentEl.createEl('div', { 
                text: '⚠️ ' + wakeLockSupport.message 
            });
            warningHint.addClass('wake-lock-warning');
        }
    }

    /**
     * 处理Wake Lock状态变化
     */
    private handleWakeLockChange(isActive: boolean, error?: string): void {
        console.log(`Wake Lock状态变化: ${isActive ? '激活' : '释放'}`, error ? `错误: ${error}` : '');
        
        if (isActive) {
            // Wake Lock激活
            this.wakeLockIndicator.removeClass('hidden');
            this.wakeLockText.setText('防锁屏已激活');
            this.wakeLockIndicator.removeClass('wake-lock-error');
            this.wakeLockIndicator.addClass('wake-lock-active');
        } else {
            if (error) {
                // Wake Lock出错
                this.wakeLockIndicator.removeClass('hidden');
                this.wakeLockText.setText(`防锁屏失败: ${error}`);
                this.wakeLockIndicator.removeClass('wake-lock-active');
                this.wakeLockIndicator.addClass('wake-lock-error');
                
                // 显示手动保持屏幕开启的提示
                if (this.detectIOS()) {
                    this.showWakeLockFallbackHint();
                }
            } else {
                // Wake Lock正常释放
                this.wakeLockIndicator.addClass('hidden');
                this.wakeLockIndicator.removeClass('wake-lock-active', 'wake-lock-error');
            }
        }
    }

    /**
     * 显示Wake Lock失败后的备用提示
     */
    private showWakeLockFallbackHint(): void {
        // 更新提示文字
        const fallbackHint = '⚠️ 防锁屏功能不可用，录音时请手动保持屏幕开启';
        
        // 如果已经在录音，显示临时通知
        if (this.state === 'recording' || this.state === 'paused') {
            new Notice(fallbackHint);
        }
        
        // 更新主提示文字
        if (this.hintText) {
            const originalText = this.hintText.textContent || '';
            if (!originalText.includes('请手动保持屏幕开启')) {
                this.hintText.setText(originalText + ' (录音时请手动保持屏幕开启)');
            }
        }
    }

    /**
     * 获取Wake Lock状态信息（用于调试）
     */
    getWakeLockInfo(): string {
        if (!this.audioRecorder) {
            return 'AudioRecorder未初始化';
        }
        
        const state = this.audioRecorder.getWakeLockState();
        return `Wake Lock - 支持:${state.isSupported}, 激活:${state.isActive}, 启用:${state.isEnabled}`;
    }

    /**
     * 紧急关闭方法 - 供外部调用
     */
    public emergencyClose(): void {
        this.closeReason = 'normal';
        this.close();
    }

} 