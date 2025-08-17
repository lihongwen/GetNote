// 图片和OCR相关的TypeScript接口定义

import { ImageItem } from './image-manager';
import { OCRResult, BatchOCRResult } from './api-client';

// ================================
// Wake Lock API的全局类型声明
// ================================

declare global {
    interface Navigator {
        wakeLock?: WakeLock;
    }

    interface WakeLock {
        request(type: 'screen'): Promise<WakeLockSentinel>;
    }

    interface WakeLockSentinel extends EventTarget {
        readonly released: boolean;
        readonly type: 'screen';
        release(): Promise<void>;
        addEventListener(type: 'release', listener: (event: Event) => void): void;
        removeEventListener(type: 'release', listener: (event: Event) => void): void;
    }
}

// ================================
// 扩展录音状态，添加OCR处理状态
// ================================

export type ExtendedRecordingState = 
    | 'idle' 
    | 'recording' 
    | 'paused' 
    | 'saving-audio' 
    | 'transcribing' 
    | 'ocr-processing'  // 新增OCR处理状态
    | 'processing' 
    | 'saving';

// ================================
// 多模态处理相关接口
// ================================

// 多模态内容接口
export interface MultimodalContent {
    audio?: {
        transcribedText: string;
        duration?: string;
        processingTime?: string;
        audioFileName?: string;
        audioFilePath?: string;
        audioBlob?: Blob; // 原始音频数据
    };
    images?: {
        items: ImageItem[];
        ocrResults: Map<string, OCRResult>; // 图片ID -> OCR结果
        totalOCRText: string; // 合并后的OCR文字
        processingTime?: string;
    };
    combinedText: string; // 音频转录 + OCR文字的合并文本
    metadata: MultimodalMetadata;
}

// 多模态元数据接口
export interface MultimodalMetadata {
    hasAudio: boolean;
    hasImages: boolean;
    audioCount: number;
    imageCount: number;
    totalProcessingTime: string;
    models: {
        speechModel?: string;
        ocrModel?: string;
        textModel?: string;
    };
    createdAt: Date;
    processedAt?: Date;
}

// ================================
// OCR处理流程相关接口
// ================================

// OCR处理进度接口
export interface OCRProgress {
    currentIndex: number;
    totalImages: number;
    currentFileName: string;
    status: 'processing' | 'completed' | 'failed';
    successCount: number;
    failureCount: number;
    errors: string[];
}

// OCR处理选项接口
export interface OCRProcessingOptions {
    includeInNote: boolean; // 是否将OCR结果包含在笔记中
    showOriginalImages: boolean; // 是否在笔记中显示原图片
    combineWithAudio: boolean; // 是否与音频文字合并处理
    retryOnFailure: boolean; // 失败时是否重试
    maxRetries: number; // 最大重试次数
}

// ================================
// 笔记生成相关接口
// ================================

// 多模态笔记内容接口
export interface MultimodalNoteContent {
    title: string;
    audioSection?: {
        content: string;
        filePath?: string;
        duration?: string;
    };
    ocrSection?: {
        content: string;
        images: Array<{
            fileName: string;
            filePath: string;
            ocrText: string;
        }>;
    };
    imageSection?: {
        images: Array<{
            fileName: string;
            filePath: string;
        }>;
    };
    summarySection?: {
        content: string;
        tags: string[];
    };
    metadata: MultimodalMetadata;
}

// 笔记生成选项接口
export interface NoteGenerationOptions {
    includeAudioSection: boolean;
    includeOCRSection: boolean;
    includeImageSection: boolean;
    includeSummarySection: boolean;
    includeMetadata: boolean;
    audioOptions: {
        includeOriginalAudio: boolean;
        showTranscription: boolean;
    };
    imageOptions: {
        includeOriginalImages: boolean;
        showOCRText: boolean;
        thumbnailSize: 'small' | 'medium' | 'large';
    };
    summaryOptions: {
        generateTags: boolean;
        generateSummary: boolean;
        combineAudioAndOCR: boolean;
    };
}

// ================================
// UI组件相关接口
// ================================

// 图片组件状态接口
export interface ImageComponentState {
    images: ImageItem[];
    selectedImages: Set<string>; // 选中的图片ID
    dragActive: boolean;
    uploadProgress: Map<string, number>; // 图片ID -> 上传进度(0-100)
    ocrProgress: OCRProgress | null;
    showPreview: boolean;
    previewImageId: string | null;
}

// 图片组件操作接口
export interface ImageComponentActions {
    onAddImages: (files: FileList | File[]) => Promise<void>;
    onRemoveImage: (imageId: string) => void;
    onSelectImage: (imageId: string, selected: boolean) => void;
    onPreviewImage: (imageId: string) => void;
    onStartOCR: (imageIds?: string[]) => Promise<void>;
    onClearAll: () => void;
}

// ================================
// 设置相关接口扩展
// ================================

// OCR设置接口
export interface OCRSettings {
    enableOCR: boolean;
    ocrModel: string;
    includeOCRInNote: boolean;
    showOriginalImages: boolean;
    combineWithAudioText: boolean;
    maxImageSize: number; // MB
    supportedFormats: string[];
    batchProcessing: boolean;
    processingDelay: number; // ms，批量处理时的延迟
}

// 扩展插件设置接口
export interface ExtendedGetNoteSettings {
    // 原有设置...
    apiKey: string;
    modelName: string;
    outputFolder: string;
    audioQuality: 'low' | 'medium' | 'high';
    maxRecordingDuration: number;
    autoSave: boolean;
    includeTimestamp: boolean;
    includeMetadata: boolean;
    promptTemplate: string;
    noteTemplate: 'meeting' | 'idea' | 'todo' | 'general';
    enableLLMProcessing: boolean;
    textModel: string;
    processOriginalText: boolean;
    generateTags: boolean;
    maxRetries: number;
    keepOriginalAudio: boolean;
    
    // 新增OCR相关设置
    ocr: OCRSettings;
    
    // 新增多模态处理设置
    multimodal: {
        enableMultimodalProcessing: boolean;
        prioritizeAudioOverOCR: boolean;
        combineTextsForLLM: boolean;
        separateProcessing: boolean;
    };
}

// ================================
// 错误处理相关接口
// ================================

// 图片处理错误接口
export interface ImageProcessingError {
    imageId: string;
    fileName: string;
    errorType: 'validation' | 'upload' | 'ocr' | 'save';
    errorMessage: string;
    timestamp: Date;
    recoverable: boolean;
}

// 多模态处理错误接口
export interface MultimodalProcessingError {
    type: 'audio' | 'image' | 'ocr' | 'llm' | 'save';
    stage: string;
    message: string;
    details?: any;
    timestamp: Date;
    imageId?: string; // 如果是图片相关错误
}

// ================================
// 事件相关接口
// ================================

// 图片处理事件接口
export interface ImageProcessingEvent {
    type: 'image-added' | 'image-removed' | 'ocr-started' | 'ocr-progress' | 'ocr-completed' | 'ocr-failed';
    data: {
        imageId?: string;
        fileName?: string;
        progress?: OCRProgress;
        error?: ImageProcessingError;
        result?: OCRResult;
    };
    timestamp: Date;
}

// 多模态处理事件接口
export interface MultimodalProcessingEvent {
    type: 'processing-started' | 'processing-progress' | 'processing-completed' | 'processing-failed' | 'processing-cancelled';
    stage: 'audio' | 'ocr' | 'llm' | 'save';
    data: {
        progress?: number; // 0-100
        currentItem?: string;
        totalItems?: number;
        error?: MultimodalProcessingError;
        result?: MultimodalContent;
    };
    timestamp: Date;
}

// ================================
// 实用工具接口
// ================================

// 文件验证结果接口
export interface FileValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    metadata: {
        totalSize: number;
        fileCount: number;
        supportedCount: number;
        unsupportedCount: number;
    };
}

// 处理统计接口
export interface ProcessingStatistics {
    audio: {
        processed: boolean;
        duration: number; // ms
        fileSize: number; // bytes
        transcriptionLength: number; // characters
    };
    images: {
        totalCount: number;
        processedCount: number;
        failedCount: number;
        totalSize: number; // bytes
        ocrTextLength: number; // characters
    };
    llm: {
        processed: boolean;
        inputLength: number; // characters
        outputLength: number; // characters
        tagsGenerated: number;
    };
    timing: {
        startTime: Date;
        endTime?: Date;
        totalDuration?: number; // ms
        audioProcessingTime?: number;
        ocrProcessingTime?: number;
        llmProcessingTime?: number;
    };
}

// ================================
// Wake Lock API相关接口
// ================================

// Wake Lock状态接口
export interface WakeLockState {
    isSupported: boolean;
    isActive: boolean;
    wakeLock: WakeLockSentinel | null;
    error?: string;
}

// Wake Lock选项接口
export interface WakeLockOptions {
    enabled: boolean;
    type: 'screen'; // 目前只支持screen类型
    onActivated?: () => void;
    onReleased?: () => void;
    onError?: (error: any) => void;
}

// Wake Lock事件接口
export interface WakeLockEvent {
    type: 'activated' | 'released' | 'error' | 'not_supported';
    timestamp: Date;
    error?: any;
}

// ================================
// 扩展录音状态，添加Wake Lock状态
// ================================

export type RecordingStateWithWakeLock = ExtendedRecordingState | 'wake-lock-activating' | 'wake-lock-failed';

// ================================
// 导出所有接口
// ================================

export * from './image-manager';
export * from './api-client';