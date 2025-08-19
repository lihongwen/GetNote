// 图片管理器 - 处理图片添加、删除、预览和缩略图生成
export interface ImageItem {
    id: string;
    file: File;
    thumbnailDataUrl: string;
    originalDataUrl: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    addedAt: Date;
    // vault相关信息
    vaultPath?: string; // vault中的相对路径
    vaultFile?: any; // Obsidian TFile对象
}

export interface ImageValidationResult {
    valid: boolean;
    error?: string;
}

export interface ImageProcessingError {
    imageId?: string;
    fileName: string;
    errorType: 'validation' | 'upload' | 'processing' | 'save' | 'timeout' | 'network';
    errorMessage: string;
    originalError?: Error;
    timestamp: Date;
    recoverable: boolean;
    suggestedAction?: string;
}

export interface BatchProcessingResult {
    successful: ImageItem[];
    failed: ImageProcessingError[];
    totalProcessed: number;
    successRate: number;
}

export class ImageManager {
    private images: Map<string, ImageItem> = new Map();
    private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
    private readonly maxImageCount = 20; // 最大图片数量
    private readonly supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    private readonly thumbnailSize = 120; // 缩略图大小
    private readonly processingTimeout = 30000; // 30秒超时

    constructor() {}

    /**
     * 添加图片文件 - 增强版本，支持详细错误报告
     */
    async addImages(files: FileList | File[]): Promise<BatchProcessingResult> {
        const successful: ImageItem[] = [];
        const failed: ImageProcessingError[] = [];
        const fileArray = Array.from(files);
        
        // 预检查
        const preCheckResults = this.preCheckFiles(fileArray);
        if (preCheckResults.length > 0) {
            failed.push(...preCheckResults);
        }
        
        // 过滤出可以处理的文件
        const validFiles = fileArray.filter(file => 
            !preCheckResults.find(error => error.fileName === file.name)
        );

        // 并行处理文件（限制并发数）
        const batchSize = 5;
        for (let i = 0; i < validFiles.length; i += batchSize) {
            const batch = validFiles.slice(i, i + batchSize);
            const batchPromises = batch.map(file => this.processImageWithTimeout(file));
            const batchResults = await Promise.allSettled(batchPromises);
            
            batchResults.forEach((result, index) => {
                const file = batch[index];
                if (result.status === 'fulfilled' && result.value.success) {
                    this.images.set(result.value.imageItem.id, result.value.imageItem);
                    successful.push(result.value.imageItem);
                } else {
                    const error = result.status === 'fulfilled' ? result.value.error : result.reason;
                    failed.push(this.createProcessingError(file, 'processing', error));
                    console.error(`添加图片失败: ${file.name}`, error);
                }
            });
        }

        const totalProcessed = successful.length + failed.length;
        const successRate = totalProcessed > 0 ? (successful.length / totalProcessed) * 100 : 0;

        return {
            successful,
            failed,
            totalProcessed,
            successRate
        };
    }

    /**
     * 向后兼容的添加图片方法
     */
    async addImagesLegacy(files: FileList | File[]): Promise<{added: ImageItem[], errors: string[]}> {
        const result = await this.addImages(files);
        return {
            added: result.successful,
            errors: result.failed.map(error => `${error.fileName}: ${error.errorMessage}`)
        };
    }

    /**
     * 为了保持兼容性，保留原来的返回格式
     */
    async addImagesCompat(files: FileList | File[]): Promise<{added: ImageItem[], errors: string[]}> {
        return this.addImagesLegacy(files);
    }

    /**
     * 删除图片
     */
    removeImage(imageId: string): boolean {
        const existed = this.images.has(imageId);
        this.images.delete(imageId);
        
        if (existed) {
        }
        
        return existed;
    }

    /**
     * 获取所有图片
     */
    getAllImages(): ImageItem[] {
        return Array.from(this.images.values()).sort((a, b) => 
            a.addedAt.getTime() - b.addedAt.getTime()
        );
    }

    /**
     * 获取图片数量
     */
    getImageCount(): number {
        return this.images.size;
    }

    /**
     * 获取指定图片
     */
    getImage(imageId: string): ImageItem | undefined {
        return this.images.get(imageId);
    }

    /**
     * 清空所有图片
     */
    clearAllImages(): void {
        this.images.clear();
    }

    /**
     * 验证图片文件 - 增强版本
     */
    private validateImage(file: File): ImageValidationResult {
        // 检查文件类型
        if (!this.supportedFormats.includes(file.type)) {
            return {
                valid: false,
                error: `不支持的图片格式 "${file.type}"，支持格式: ${this.supportedFormats.join(', ')}`
            };
        }

        // 检查文件大小
        if (file.size === 0) {
            return {
                valid: false,
                error: '文件为空，请选择有效的图片文件'
            };
        }

        if (file.size > this.maxFileSize) {
            return {
                valid: false,
                error: `文件过大 (${this.formatFileSize(file.size)})，最大支持 ${this.formatFileSize(this.maxFileSize)}`
            };
        }

        // 检查文件名
        if (!file.name || file.name.trim().length === 0) {
            return {
                valid: false,
                error: '文件名无效或为空'
            };
        }

        // 检查文件名长度和字符
        if (file.name.length > 255) {
            return {
                valid: false,
                error: '文件名过长，请重命名后重试'
            };
        }

        // 检查危险字符
        const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
        if (dangerousChars.test(file.name)) {
            return {
                valid: false,
                error: '文件名包含不安全字符，请重命名后重试'
            };
        }

        return { valid: true };
    }

    /**
     * 预检查文件列表
     */
    private preCheckFiles(files: File[]): ImageProcessingError[] {
        const errors: ImageProcessingError[] = [];

        // 检查总数量限制
        const currentCount = this.images.size;
        const newCount = files.length;
        const totalCount = currentCount + newCount;

        if (totalCount > this.maxImageCount) {
            const allowedNew = this.maxImageCount - currentCount;
            if (allowedNew <= 0) {
                errors.push({
                    fileName: '所有文件',
                    errorType: 'validation',
                    errorMessage: `已达到最大图片数量限制 (${this.maxImageCount}张)`,
                    timestamp: new Date(),
                    recoverable: false,
                    suggestedAction: '请删除一些现有图片后重试'
                });
                return errors;
            } else {
                errors.push({
                    fileName: '部分文件',
                    errorType: 'validation',
                    errorMessage: `只能再添加 ${allowedNew} 张图片 (当前限制: ${this.maxImageCount}张)`,
                    timestamp: new Date(),
                    recoverable: true,
                    suggestedAction: `将只处理前 ${allowedNew} 张图片`
                });
            }
        }

        // 检查总文件大小
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const maxTotalSize = this.maxFileSize * 5; // 允许总大小是单文件限制的5倍
        if (totalSize > maxTotalSize) {
            errors.push({
                fileName: '批量文件',
                errorType: 'validation',
                errorMessage: `批量文件总大小过大 (${this.formatFileSize(totalSize)})，建议分批上传`,
                timestamp: new Date(),
                recoverable: true,
                suggestedAction: '建议每次上传不超过5张图片'
            });
        }

        // 检查重复文件名
        const existingNames = new Set(this.getAllImages().map(img => img.fileName));
        const duplicates = files.filter(file => existingNames.has(file.name));
        duplicates.forEach(file => {
            errors.push({
                fileName: file.name,
                errorType: 'validation',
                errorMessage: '文件名已存在',
                timestamp: new Date(),
                recoverable: true,
                suggestedAction: '重命名文件后重试'
            });
        });

        return errors;
    }

    /**
     * 带超时的图片处理
     */
    private async processImageWithTimeout(file: File): Promise<{
        success: boolean;
        imageItem?: ImageItem;
        error?: Error;
    }> {
        return new Promise(async (resolve) => {
            const timeoutId = setTimeout(() => {
                resolve({
                    success: false,
                    error: new Error(`处理超时 (${this.processingTimeout / 1000}秒)`)
                });
            }, this.processingTimeout);

            try {
                const validation = this.validateImage(file);
                if (!validation.valid) {
                    clearTimeout(timeoutId);
                    resolve({
                        success: false,
                        error: new Error(validation.error)
                    });
                    return;
                }

                const imageItem = await this.createImageItem(file);
                clearTimeout(timeoutId);
                resolve({
                    success: true,
                    imageItem
                });
            } catch (error) {
                clearTimeout(timeoutId);
                resolve({
                    success: false,
                    error: error instanceof Error ? error : new Error(String(error))
                });
            }
        });
    }

    /**
     * 创建处理错误对象
     */
    private createProcessingError(
        file: File,
        errorType: ImageProcessingError['errorType'],
        error: Error | string,
        imageId?: string
    ): ImageProcessingError {
        const errorMessage = error instanceof Error ? error.message : String(error);
        let suggestedAction = '';
        let recoverable = true;

        // 根据错误类型提供建议
        switch (errorType) {
            case 'validation':
                recoverable = false;
                suggestedAction = '请检查文件格式、大小和文件名';
                break;
            case 'timeout':
                suggestedAction = '网络较慢，请稍后重试或检查网络连接';
                break;
            case 'network':
                suggestedAction = '请检查网络连接后重试';
                break;
            case 'processing':
                suggestedAction = '文件可能已损坏，请尝试其他图片';
                recoverable = false;
                break;
            case 'save':
                suggestedAction = '检查存储空间和文件权限';
                break;
            default:
                suggestedAction = '请稍后重试或联系技术支持';
        }

        return {
            imageId,
            fileName: file.name,
            errorType,
            errorMessage,
            originalError: error instanceof Error ? error : undefined,
            timestamp: new Date(),
            recoverable,
            suggestedAction
        };
    }

    /**
     * 创建图片项
     */
    private async createImageItem(file: File): Promise<ImageItem> {
        const id = this.generateImageId();
        const originalDataUrl = await this.fileToDataUrl(file);
        const thumbnailDataUrl = await this.generateThumbnail(file);

        return {
            id,
            file,
            thumbnailDataUrl,
            originalDataUrl,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            addedAt: new Date()
        };
    }

    /**
     * 生成图片ID
     */
    private generateImageId(): string {
        return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 将文件转换为Data URL
     */
    private fileToDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * 生成缩略图
     */
    private async generateThumbnail(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    if (!ctx) {
                        reject(new Error('无法创建Canvas上下文'));
                        return;
                    }

                    // 计算缩略图尺寸（保持宽高比）
                    const { width, height } = this.calculateThumbnailSize(
                        img.width, 
                        img.height, 
                        this.thumbnailSize
                    );

                    canvas.width = width;
                    canvas.height = height;

                    // 绘制缩略图
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 转换为Data URL
                    const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(thumbnailDataUrl);
                } catch (error) {
                    reject(error);
                }
            };
            
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * 计算缩略图尺寸
     */
    private calculateThumbnailSize(
        originalWidth: number, 
        originalHeight: number, 
        maxSize: number
    ): { width: number; height: number } {
        let width = originalWidth;
        let height = originalHeight;

        if (width > height) {
            if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
            }
        } else {
            if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
            }
        }

        return { width: Math.round(width), height: Math.round(height) };
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
     * 获取总文件大小
     */
    getTotalFileSize(): number {
        return Array.from(this.images.values())
            .reduce((total, item) => total + item.fileSize, 0);
    }

    /**
     * 获取支持的图片格式
     */
    getSupportedFormats(): string[] {
        return [...this.supportedFormats];
    }

    /**
     * 获取最大文件大小限制
     */
    getMaxFileSize(): number {
        return this.maxFileSize;
    }

    /**
     * 检查是否支持指定格式
     */
    isFormatSupported(mimeType: string): boolean {
        return this.supportedFormats.includes(mimeType);
    }

    /**
     * 创建文件输入元素
     */
    createFileInput(): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = this.supportedFormats.join(',');
        input.multiple = true;
        input.classList.add('hidden');
        
        return input;
    }

    /**
     * 处理拖拽文件
     */
    async handleDroppedFiles(event: DragEvent): Promise<{added: ImageItem[], errors: string[]}> {
        event.preventDefault();
        
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) {
            return { added: [], errors: ['没有检测到文件'] };
        }

        return await this.addImagesLegacy(files);
    }

    /**
     * 批量转换为Base64 (用于API调用)
     */
    async getImagesAsBase64(): Promise<{id: string, fileName: string, base64: string, mimeType: string}[]> {
        const result = [];
        
        for (const item of this.getAllImages()) {
            try {
                // 移除Data URL前缀，只保留base64部分
                const base64 = item.originalDataUrl.split(',')[1];
                result.push({
                    id: item.id,
                    fileName: item.fileName,
                    base64: base64,
                    mimeType: item.fileType
                });
            } catch (error) {
                console.error(`转换图片${item.fileName}为Base64失败:`, error);
            }
        }
        
        return result;
    }

    /**
     * 导出图片信息摘要
     */
    getImagesSummary(): {
        count: number;
        totalSize: string;
        formats: string[];
        fileNames: string[];
    } {
        const images = this.getAllImages();
        const formats = [...new Set(images.map(img => img.fileType))];
        
        return {
            count: images.length,
            totalSize: this.formatFileSize(this.getTotalFileSize()),
            formats: formats,
            fileNames: images.map(img => img.fileName)
        };
    }

    /**
     * 检查是否为空
     */
    isEmpty(): boolean {
        return this.images.size === 0;
    }

    /**
     * 检查浏览器兼容性
     */
    static isSupported(): boolean {
        return !!(
            window.File && 
            window.FileReader && 
            window.FileList && 
            window.Blob &&
            document.createElement('canvas').getContext
        );
    }

    /**
     * 获取验证限制信息
     */
    getValidationLimits(): {
        maxFileSize: number;
        maxImageCount: number;
        supportedFormats: string[];
        processingTimeout: number;
        currentImageCount: number;
        remainingSlots: number;
    } {
        const currentCount = this.images.size;
        return {
            maxFileSize: this.maxFileSize,
            maxImageCount: this.maxImageCount,
            supportedFormats: [...this.supportedFormats],
            processingTimeout: this.processingTimeout,
            currentImageCount: currentCount,
            remainingSlots: Math.max(0, this.maxImageCount - currentCount)
        };
    }

    /**
     * 批量验证文件（不添加）
     */
    validateFiles(files: FileList | File[]): {
        valid: File[];
        invalid: { file: File; error: string }[];
        warnings: string[];
    } {
        const fileArray = Array.from(files);
        const valid: File[] = [];
        const invalid: { file: File; error: string }[] = [];
        const warnings: string[] = [];

        // 检查总数量
        const currentCount = this.images.size;
        const newCount = fileArray.length;
        if (currentCount + newCount > this.maxImageCount) {
            const allowedCount = Math.max(0, this.maxImageCount - currentCount);
            warnings.push(`只能添加 ${allowedCount} 张图片，将忽略多余的文件`);
        }

        // 验证每个文件
        fileArray.forEach((file, index) => {
            if (currentCount + valid.length >= this.maxImageCount) {
                invalid.push({ file, error: '超出数量限制' });
                return;
            }

            const validation = this.validateImage(file);
            if (validation.valid) {
                valid.push(file);
            } else {
                invalid.push({ file, error: validation.error || '验证失败' });
            }
        });

        return { valid, invalid, warnings };
    }

    /**
     * 获取错误统计
     */
    getErrorStatistics(errors: ImageProcessingError[]): {
        totalErrors: number;
        byType: Record<string, number>;
        recoverable: number;
        nonRecoverable: number;
        mostCommonError: string;
    } {
        const byType: Record<string, number> = {};
        let recoverable = 0;
        let nonRecoverable = 0;

        errors.forEach(error => {
            byType[error.errorType] = (byType[error.errorType] || 0) + 1;
            if (error.recoverable) {
                recoverable++;
            } else {
                nonRecoverable++;
            }
        });

        const mostCommonError = Object.entries(byType)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

        return {
            totalErrors: errors.length,
            byType,
            recoverable,
            nonRecoverable,
            mostCommonError
        };
    }

    /**
     * 生成用户友好的错误报告
     */
    generateErrorReport(result: BatchProcessingResult): string {
        if (result.failed.length === 0) {
            return `成功处理所有 ${result.successful.length} 张图片`;
        }

        const stats = this.getErrorStatistics(result.failed);
        const lines = [
            `处理完成: 成功 ${result.successful.length} 张，失败 ${result.failed.length} 张`,
            `成功率: ${result.successRate.toFixed(1)}%`
        ];

        // 按错误类型分组显示
        if (stats.byType.validation > 0) {
            lines.push(`- 验证失败: ${stats.byType.validation} 张（文件格式或大小问题）`);
        }
        if (stats.byType.timeout > 0) {
            lines.push(`- 处理超时: ${stats.byType.timeout} 张（网络或文件处理慢）`);
        }
        if (stats.byType.processing > 0) {
            lines.push(`- 处理失败: ${stats.byType.processing} 张（文件可能损坏）`);
        }

        // 建议
        if (stats.recoverable > 0) {
            lines.push(`\n可重试: ${stats.recoverable} 张图片`);
        }
        if (stats.nonRecoverable > 0) {
            lines.push(`需要修复: ${stats.nonRecoverable} 张图片`);
        }

        return lines.join('\n');
    }

    /**
     * 清理失败的图片记录
     */
    cleanupFailedImages(errors: ImageProcessingError[]): void {
        errors.forEach(error => {
            if (error.imageId && this.images.has(error.imageId)) {
                this.images.delete(error.imageId);
            }
        });
    }

    /**
     * 重试可恢复的错误
     */
    async retryRecoverableErrors(errors: ImageProcessingError[], originalFiles: File[]): Promise<BatchProcessingResult> {
        const retryableErrors = errors.filter(error => error.recoverable);
        const retryFiles = originalFiles.filter(file => 
            retryableErrors.find(error => error.fileName === file.name)
        );

        if (retryFiles.length === 0) {
            return {
                successful: [],
                failed: [],
                totalProcessed: 0,
                successRate: 0
            };
        }

        return await this.addImages(retryFiles);
    }

    /**
     * 获取内存使用情况
     */
    getMemoryUsage(): {
        totalImages: number;
        totalSize: number;
        averageSize: number;
        memoryFootprint: string;
    } {
        const images = this.getAllImages();
        const totalSize = images.reduce((sum, img) => sum + img.fileSize, 0);
        const averageSize = images.length > 0 ? totalSize / images.length : 0;
        
        // 估算内存占用（考虑DataURL和缩略图）
        const estimatedMemory = totalSize * 2.5; // 大概的内存倍数

        return {
            totalImages: images.length,
            totalSize,
            averageSize,
            memoryFootprint: this.formatFileSize(estimatedMemory)
        };
    }
}