import { ItemView, WorkspaceLeaf, ButtonComponent, Notice } from 'obsidian';
import GetNotePlugin from '../main';
import { AudioRecorder } from './recorder';
import { ImageManager, ImageItem } from './image-manager';
import { ExtendedRecordingState, ImageComponentState } from './types';

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
    private onCancel?: () => void;
    
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
        
        // 图片区域 (仅在启用OCR时显示)
        if (this.enableImageOCR) {
            this.createImageSection(container);
        }
        
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
        this.imageState.images.forEach(image => {
            if (image.thumbnailDataUrl && image.thumbnailDataUrl.startsWith('blob:')) {
                URL.revokeObjectURL(image.thumbnailDataUrl);
            }
            if (image.originalDataUrl && image.originalDataUrl.startsWith('blob:')) {
                URL.revokeObjectURL(image.originalDataUrl);
            }
        });
        this.imageState.images = [];
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
                    await this.onRecordingComplete(new Blob(), this.imageState.images.length > 0 ? this.imageState.images : undefined);
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
        // 注意：不清空图片，让用户可以在多次录音中重复使用
    }

    // ====== 图片相关方法 ======
    
    /**
     * 创建图片区域
     */
    private createImageSection(container: HTMLElement): void {
        this.imageSection = container.createDiv('image-section');
        
        // 标题和图片计数
        const titleContainer = this.imageSection.createDiv('image-section-title-container');
        const titleContent = titleContainer.createDiv('image-section-title-content');
        
        const title = titleContent.createEl('h3', { text: '添加图片' });
        title.addClass('image-section-title');
        
        const imageCount = titleContent.createEl('span', { text: `(${this.imageState.images.length})` });
        imageCount.addClass('image-count');
        
        // 创建整合的图片区域
        this.createIntegratedImageArea();
        
        // 创建进度显示区域
        this.createProgressAreas();
        
        // 设置图片事件
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
        
        // 隐藏的文件输入
        this.imageFileInput = this.imageSection.createEl('input', {
            type: 'file',
            attr: { 
                accept: 'image/*', 
                multiple: 'true',
                style: 'display: none;'
            }
        }) as HTMLInputElement;
        
        // 保持拖拽功能，将整个区域设为拖拽目标
        this.imageUploadArea = integratedArea; // 复用原有的拖拽区域变量
        
        // 初始化图片网格
        this.updateImageGrid();
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
            
            // 更新图片状态
            this.imageState.images.push(...result.added);
            
            // 更新UI
            this.updateImageGrid();
            this.updateImageCount();
            
            if (result.errors.length > 0) {
                const errorMessage = `添加了 ${result.added.length} 张图片，${result.errors.length} 张失败`;
                new Notice(errorMessage);
                console.warn('图片添加错误:', result.errors);
            } else {
                new Notice(`成功添加 ${result.added.length} 张图片`);
            }
            
        } catch (error) {
            console.error('处理图片文件失败:', error);
            new Notice(`添加图片失败: ${error.message}`);
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
            emptyHint.addClass('image-empty-hint');
            return;
        }
        
        // 渲染图片项
        this.imageState.images.forEach((image, index) => {
            this.renderImageItem(image, index);
        });
    }

    /**
     * 渲染单个图片项
     */
    private renderImageItem(image: ImageItem, index: number): void {
        const itemEl = this.imageGrid.createDiv('image-item');
        itemEl.dataset.imageId = image.id;
        
        // 缩略图容器
        const thumbnailContainer = itemEl.createDiv('image-thumbnail-container');
        
        // 缩略图
        const thumbnail = thumbnailContainer.createEl('img');
        thumbnail.className = 'image-thumbnail';
        thumbnail.src = image.thumbnailDataUrl;
        thumbnail.alt = image.fileName;
        
        // 删除按钮 - 增强版
        const deleteBtn = thumbnailContainer.createDiv('image-delete-btn');
        deleteBtn.innerHTML = '❌';
        deleteBtn.title = '删除图片';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showImageDeleteConfirmation(image.id, image.fileName);
        });
        
        // 图片信息
        const infoContainer = itemEl.createDiv('image-info');
        const fileName = infoContainer.createEl('div', { text: image.fileName });
        fileName.className = 'image-filename';
        const fileSize = infoContainer.createEl('div', { text: this.formatFileSize(image.fileSize) });
        fileSize.className = 'image-filesize';
        
        // 点击预览（可选实现）
        itemEl.addEventListener('click', () => {
            this.previewImage(image);
        });
    }

    /**
     * 显示删除确认对话框
     */
    private showImageDeleteConfirmation(imageId: string, fileName: string): void {
        const message = `确定要删除图片 "${fileName}" 吗？此操作无法撤销。`;
        
        if (confirm(message)) {
            this.removeImage(imageId);
        }
    }

    /**
     * 移除图片
     */
    private removeImage(imageId: string): void {
        const index = this.imageState.images.findIndex(img => img.id === imageId);
        if (index !== -1) {
            const image = this.imageState.images[index];
            
            // 释放 blob URLs
            if (image.thumbnailDataUrl && image.thumbnailDataUrl.startsWith('blob:')) {
                URL.revokeObjectURL(image.thumbnailDataUrl);
            }
            if (image.originalDataUrl && image.originalDataUrl.startsWith('blob:')) {
                URL.revokeObjectURL(image.originalDataUrl);
            }
            
            // 从数组中移除
            this.imageState.images.splice(index, 1);
            this.imageState.selectedImages.delete(imageId);
            
            // 更新UI
            this.updateImageGrid();
            this.updateImageCount();
            
            new Notice(`图片 "${image.fileName}" 已删除`);
        }
    }

    /**
     * 更新图片计数显示
     */
    private updateImageCount(): void {
        const countEl = this.imageSection.querySelector('.image-count') as HTMLElement;
        if (countEl) {
            countEl.textContent = `(${this.imageState.images.length})`;
        }
    }

    /**
     * 预览图片（简单实现）
     */
    private previewImage(image: ImageItem): void {
        new Notice(`预览图片: ${image.fileName}`);
        // 这里可以扩展为完整的图片预览功能
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
     * 显示图片处理进度
     */
    private showImageProgress(message: string): void {
        this.imageProgress.textContent = message;
        this.imageProgress.removeClass('hidden');
    }

    /**
     * 隐藏图片处理进度
     */
    private hideImageProgress(): void {
        this.imageProgress.addClass('hidden');
    }

    /**
     * 获取当前所有图片
     */
    public getImages(): ImageItem[] {
        return this.imageState.images;
    }

    /**
     * 紧急关闭方法 - 供外部调用
     */
    public emergencyClose(): void {
        this.leaf.detach();
    }
} 