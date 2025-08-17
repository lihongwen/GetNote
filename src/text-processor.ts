// 文本处理器 - 负责LLM文本优化和标签生成
import { DashScopeClient, TextProcessingResult, OCRResult } from './api-client';
import { ImageItem } from './image-manager';
import { MultimodalContent } from './types';

export interface TextProcessorSettings {
    enableLLMProcessing: boolean;
    textModel: string;
    processOriginalText: boolean;
    generateTags: boolean;
    maxRetries: number;
}

export interface EnhancedProcessingResult {
    originalText: string;
    processedText: string;
    tags: string[];
    structuredTags: StructuredTags;
    summary: string;
    smartTitle: string;
    isProcessed: boolean;
}

export interface StructuredTags {
    people: string[];     // 人物
    events: string[];     // 事件
    topics: string[];     // 主题
    times: string[];      // 时间
    locations: string[];  // 地点
}

// 多模态处理结果接口
export interface MultimodalProcessingResult {
    audioText: string; // 音频转录文本
    ocrText: string; // OCR识别文本
    combinedText: string; // 合并后的文本
    processedText: string; // LLM处理后的文本
    summary: string; // 内容摘要
    tags: string[]; // 生成的标签
    structuredTags: StructuredTags; // 结构化标签
    smartTitle: string; // 智能标题
    isProcessed: boolean; // 是否成功处理
    audioOnly: boolean; // 是否仅包含音频
    imageOnly: boolean; // 是否仅包含图片
    multimodal: boolean; // 是否为多模态内容
    processingTime?: string; // 处理时长
}

// OCR文本项接口
export interface OCRTextItem {
    imageId: string;
    fileName: string;
    text: string;
    confidence?: number;
}

export const DEFAULT_TEXT_PROCESSOR_SETTINGS: TextProcessorSettings = {
    enableLLMProcessing: false,
    textModel: 'qwen-plus-latest',
    processOriginalText: true,
    generateTags: true,
    maxRetries: 2
};

export class TextProcessor {
    private client: DashScopeClient;
    private settings: TextProcessorSettings;

    constructor(apiKey: string, settings: TextProcessorSettings) {
        this.client = new DashScopeClient(apiKey);
        this.settings = settings;
    }

    /**
     * 增强的文本处理 - 新的主要入口点
     * @param transcribedText 原始转录文本
     * @returns 包含所有增强信息的处理结果
     */
    async processTranscribedTextEnhanced(transcribedText: string): Promise<EnhancedProcessingResult> {
        // 如果未启用LLM处理，直接返回原文
        if (!this.settings.enableLLMProcessing) {
            return {
                originalText: transcribedText,
                processedText: transcribedText,
                tags: [],
                structuredTags: { people: [], events: [], topics: [], times: [], locations: [] },
                summary: transcribedText,
                smartTitle: this.generateBasicTitle(transcribedText),
                isProcessed: false
            };
        }

        try {
            console.log('开始增强LLM文本处理...');
            
            // 并行执行多个LLM任务
            const [basicResult, structuredTags, summary, title] = await Promise.all([
                this.processWithRetry(transcribedText),
                this.generateStructuredTags(transcribedText),
                this.generateContentSummary(transcribedText),
                this.generateSmartTitle(transcribedText)
            ]);
            
            return {
                originalText: transcribedText,
                processedText: basicResult.processedText,
                tags: basicResult.tags,
                structuredTags: structuredTags,
                summary: summary,
                smartTitle: title,
                isProcessed: true
            };

        } catch (error) {
            console.error('增强LLM处理失败，使用基础处理:', error);
            
            // 容错处理：尝试基础处理
            try {
                const basicResult = await this.processWithRetry(transcribedText);
                return {
                    originalText: transcribedText,
                    processedText: basicResult.processedText,
                    tags: basicResult.tags,
                    structuredTags: { people: [], events: [], topics: [], times: [], locations: [] },
                    summary: transcribedText.substring(0, 200) + '...',
                    smartTitle: this.generateBasicTitle(transcribedText),
                    isProcessed: true
                };
            } catch (basicError) {
                console.error('基础LLM处理也失败，返回原始文本:', basicError);
                return {
                    originalText: transcribedText,
                    processedText: transcribedText,
                    tags: [],
                    structuredTags: { people: [], events: [], topics: [], times: [], locations: [] },
                    summary: transcribedText,
                    smartTitle: this.generateBasicTitle(transcribedText),
                    isProcessed: false
                };
            }
        }
    }

    /**
     * 处理转录文本 - 向后兼容的入口点
     * @param transcribedText 原始转录文本
     * @returns 处理结果包含优化后的文本和标签
     */
    async processTranscribedText(transcribedText: string): Promise<{
        originalText: string;
        processedText: string;
        tags: string[];
        isProcessed: boolean;
    }> {
        // 如果未启用LLM处理，直接返回原文
        if (!this.settings.enableLLMProcessing) {
            return {
                originalText: transcribedText,
                processedText: transcribedText,
                tags: [],
                isProcessed: false
            };
        }

        try {
            console.log('开始LLM文本处理...');
            
            // 调用LLM处理
            const result = await this.processWithRetry(transcribedText);
            
            return {
                originalText: transcribedText,
                processedText: result.processedText,
                tags: result.tags,
                isProcessed: true
            };

        } catch (error) {
            console.error('LLM处理失败，使用原始文本:', error);
            
            // 容错处理：返回原始文本
            return {
                originalText: transcribedText,
                processedText: transcribedText,
                tags: [],
                isProcessed: false
            };
        }
    }

    /**
     * 带重试机制的文本处理
     */
    private async processWithRetry(text: string): Promise<TextProcessingResult> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= this.settings.maxRetries; attempt++) {
            try {
                console.log(`文本处理尝试 ${attempt}/${this.settings.maxRetries}`);
                
                const result = await this.client.processTextWithLLM(
                    text, 
                    this.settings.textModel
                );
                
                console.log('文本处理成功');
                return result;
                
            } catch (error) {
                lastError = error;
                console.error(`文本处理尝试 ${attempt} 失败:`, error);
                
                // 如果不是最后一次尝试，等待一段时间后重试
                if (attempt < this.settings.maxRetries) {
                    await this.delay(1000 * attempt); // 递增延迟
                }
            }
        }
        
        // 所有重试都失败了
        throw lastError || new Error('文本处理失败');
    }

    /**
     * 测试LLM连接
     */
    async testLLMConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            return await this.client.testTextLLM(this.settings.textModel);
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 更新设置
     */
    updateSettings(newSettings: Partial<TextProcessorSettings>): void {
        this.settings = { ...this.settings, ...newSettings };
    }

    /**
     * 获取当前设置
     */
    getSettings(): TextProcessorSettings {
        return { ...this.settings };
    }

    /**
     * 验证文本是否适合处理
     */
    validateText(text: string): { valid: boolean; reason?: string } {
        if (!text || text.trim().length === 0) {
            return { valid: false, reason: '文本为空' };
        }

        if (text.length < 10) {
            return { valid: false, reason: '文本过短，不需要处理' };
        }

        if (text.length > 10000) {
            return { valid: false, reason: '文本过长，超出处理限制' };
        }

        return { valid: true };
    }

    /**
     * 获取支持的模型列表
     */
    getSupportedModels(): Array<{ id: string; name: string; description: string }> {
        return [
            {
                id: 'qwen-plus-latest',
                name: 'Qwen Plus Latest',
                description: '高质量文本处理，推荐使用'
            },
            {
                id: 'qwen-turbo-latest',
                name: 'Qwen Turbo Latest',
                description: '快速文本处理，成本较低'
            },
            {
                id: 'qwen-max-latest',
                name: 'Qwen Max Latest',
                description: '最高质量文本处理，成本较高'
            }
        ];
    }

    /**
     * 生成结构化标签
     */
    async generateStructuredTags(text: string): Promise<StructuredTags> {
        const prompt = `请分析以下文本内容，提取结构化标签信息。请直接返回JSON格式，不要包含任何其他文字：

文本内容：
${text}

要求：
1. 提取人物（people）：文本中提到的具体人名
2. 提取事件（events）：会议、讨论、决定、任务等事件类型
3. 提取主题（topics）：工作、技术、生活、学习等主题分类
4. 提取时间（times）：周一、上午、下周等时间相关信息
5. 提取地点（locations）：办公室、家里、会议室等地点信息

返回格式：
{
  "people": ["张三", "李四"],
  "events": ["会议", "讨论"],
  "topics": ["工作", "技术"],
  "times": ["周一", "上午"],
  "locations": ["办公室", "会议室"]
}`;

        try {
            const response = await this.client.processTextWithLLM(prompt, this.settings.textModel);
            
            // 尝试解析LLM返回的JSON
            try {
                const parsed = JSON.parse(response.processedText);
                return {
                    people: Array.isArray(parsed.people) ? parsed.people : [],
                    events: Array.isArray(parsed.events) ? parsed.events : [],
                    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
                    times: Array.isArray(parsed.times) ? parsed.times : [],
                    locations: Array.isArray(parsed.locations) ? parsed.locations : []
                };
            } catch (parseError) {
                console.error('解析结构化标签JSON失败:', parseError);
                return { people: [], events: [], topics: [], times: [], locations: [] };
            }
        } catch (error) {
            console.error('生成结构化标签失败:', error);
            return { people: [], events: [], topics: [], times: [], locations: [] };
        }
    }

    /**
     * 生成内容概要
     */
    async generateContentSummary(text: string): Promise<string> {
        const prompt = `请对以下文本内容进行概要提取，用简洁的语言总结主要内容。要求：

1. 用1-3个自然段落概括主要内容
2. 保留关键信息和重要细节
3. 语言简洁明了，易于理解
4. 不要添加标题或格式标记

文本内容：
${text}`;

        try {
            const response = await this.client.processTextWithLLM(prompt, this.settings.textModel);
            return response.processedText.trim();
        } catch (error) {
            console.error('生成内容概要失败:', error);
            // 降级处理：返回文本前200字符
            return text.length > 200 ? text.substring(0, 200) + '...' : text;
        }
    }

    /**
     * 生成智能标题
     */
    async generateSmartTitle(text: string): Promise<string> {
        const prompt = `请为以下文本内容生成一个简洁的标题概要，要求：

1. 长度控制在15-30个字符
2. 概括核心内容和关键信息
3. 包含重要的人物或事件（如果有）
4. 语言简洁有力，适合作为标题
5. 不要包含时间前缀，只返回内容概要

文本内容：
${text}`;

        try {
            const response = await this.client.processTextWithLLM(prompt, this.settings.textModel);
            const title = response.processedText.trim();
            
            // 确保标题长度适中
            if (title.length > 30) {
                return title.substring(0, 27) + '...';
            }
            
            return title || this.generateBasicTitle(text);
        } catch (error) {
            console.error('生成智能标题失败:', error);
            return this.generateBasicTitle(text);
        }
    }

    /**
     * 生成基础标题（降级方案）
     */
    private generateBasicTitle(text: string): string {
        // 提取文本前几个词作为标题
        const words = text.trim().split(/\s+/);
        let title = words.slice(0, 8).join(' ');
        
        if (title.length > 30) {
            title = title.substring(0, 27) + '...';
        }
        
        return title || '语音笔记';
    }

    /**
     * 延迟辅助函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 处理多模态内容 - 新的主要入口点
     * @param multimodalContent 包含音频和图片信息的多模态内容
     * @returns 多模态处理结果
     */
    async processMultimodalContent(multimodalContent: MultimodalContent): Promise<MultimodalProcessingResult> {
        const startTime = Date.now();
        
        // 提取音频和OCR文本
        const audioText = multimodalContent.audio?.transcribedText || '';
        const ocrText = multimodalContent.images?.totalOCRText || '';
        const combinedText = multimodalContent.combinedText || this.combineAudioAndOCRText(audioText, ocrText);
        
        // 判断内容类型
        const audioOnly = !!audioText && !ocrText;
        const imageOnly = !audioText && !!ocrText;
        const multimodal = !!audioText && !!ocrText;
        
        // 如果未启用LLM处理，直接返回原始内容
        if (!this.settings.enableLLMProcessing) {
            return {
                audioText,
                ocrText,
                combinedText,
                processedText: combinedText,
                summary: combinedText,
                tags: [],
                structuredTags: { people: [], events: [], topics: [], times: [], locations: [] },
                smartTitle: this.generateBasicTitle(combinedText),
                isProcessed: false,
                audioOnly,
                imageOnly,
                multimodal,
                processingTime: `${Date.now() - startTime}ms`
            };
        }

        try {
            console.log('开始多模态内容处理...');
            
            // 选择处理策略
            let processedText: string;
            let tags: string[];
            let structuredTags: StructuredTags;
            let summary: string;
            let smartTitle: string;
            
            if (multimodal) {
                // 多模态内容：使用组合文本进行处理
                const [basicResult, structuredTagsResult, summaryResult, titleResult] = await Promise.all([
                    this.processMultimodalTextWithLLM(audioText, ocrText, combinedText),
                    this.generateStructuredTags(combinedText),
                    this.generateContentSummary(combinedText),
                    this.generateSmartTitle(combinedText)
                ]);
                
                processedText = basicResult.processedText;
                tags = basicResult.tags;
                structuredTags = structuredTagsResult;
                summary = summaryResult;
                smartTitle = titleResult;
            } else {
                // 单模态内容：使用现有方法处理
                const textToProcess = audioText || ocrText;
                const [basicResult, structuredTagsResult, summaryResult, titleResult] = await Promise.all([
                    this.processWithRetry(textToProcess),
                    this.generateStructuredTags(textToProcess),
                    this.generateContentSummary(textToProcess),
                    this.generateSmartTitle(textToProcess)
                ]);
                
                processedText = basicResult.processedText;
                tags = basicResult.tags;
                structuredTags = structuredTagsResult;
                summary = summaryResult;
                smartTitle = titleResult;
            }
            
            return {
                audioText,
                ocrText,
                combinedText,
                processedText,
                summary,
                tags,
                structuredTags,
                smartTitle,
                isProcessed: true,
                audioOnly,
                imageOnly,
                multimodal,
                processingTime: `${Date.now() - startTime}ms`
            };

        } catch (error) {
            console.error('多模态内容处理失败:', error);
            
            // 降级处理：尝试基础处理
            try {
                const basicResult = await this.processWithRetry(combinedText);
                return {
                    audioText,
                    ocrText,
                    combinedText,
                    processedText: basicResult.processedText,
                    summary: combinedText.length > 200 ? combinedText.substring(0, 200) + '...' : combinedText,
                    tags: basicResult.tags,
                    structuredTags: { people: [], events: [], topics: [], times: [], locations: [] },
                    smartTitle: this.generateBasicTitle(combinedText),
                    isProcessed: true,
                    audioOnly,
                    imageOnly,
                    multimodal,
                    processingTime: `${Date.now() - startTime}ms`
                };
            } catch (basicError) {
                console.error('基础处理也失败，返回原始内容:', basicError);
                return {
                    audioText,
                    ocrText,
                    combinedText,
                    processedText: combinedText,
                    summary: combinedText,
                    tags: [],
                    structuredTags: { people: [], events: [], topics: [], times: [], locations: [] },
                    smartTitle: this.generateBasicTitle(combinedText),
                    isProcessed: false,
                    audioOnly,
                    imageOnly,
                    multimodal,
                    processingTime: `${Date.now() - startTime}ms`
                };
            }
        }
    }

    /**
     * 多模态文本LLM处理 - 以语音为主体，图片为参考理解背景
     */
    private async processMultimodalTextWithLLM(
        audioText: string, 
        ocrText: string, 
        combinedText: string
    ): Promise<TextProcessingResult> {
        const prompt = `请理解并整理用户的想法和感受：

【用户的语音想法】（这是用户的主要思考和表达）：
${audioText}

【用户看到的参考内容】（这是用户看到/读到的背景材料）：
${ocrText}

处理原则：
1. **语音内容是核心**：用户的语音表达了他们的想法、感受、观点和思考
2. **图片内容是参考**：用户看到的文字帮助理解用户产生这些想法的背景和触发因素
3. **理解用户意图**：分析用户基于所见内容产生了什么想法、感受或洞察
4. 修正语音转录中的语法错误，保持用户的原始意图和语气
5. 如果图片内容能帮助理解语音内容的背景，可以适当补充说明
6. 生成准确反映用户想法主题的标签

请整理用户的思考内容，然后换行返回相关标签（格式：标签：tag1,tag2,tag3）`;

        return await this.client.processTextWithLLM(prompt, this.settings.textModel);
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
     * 处理OCR文本项列表
     */
    async processOCRTextItems(ocrItems: OCRTextItem[]): Promise<{
        combinedText: string;
        processedText: string;
        tags: string[];
        isProcessed: boolean;
    }> {
        if (!ocrItems || ocrItems.length === 0) {
            return {
                combinedText: '',
                processedText: '',
                tags: [],
                isProcessed: false
            };
        }

        // 合并所有OCR文本
        const combinedOCRText = ocrItems
            .map(item => `【${item.fileName}】\n${item.text}`)
            .join('\n\n');

        // 如果未启用LLM处理，直接返回合并文本
        if (!this.settings.enableLLMProcessing) {
            return {
                combinedText: combinedOCRText,
                processedText: combinedOCRText,
                tags: [],
                isProcessed: false
            };
        }

        try {
            const result = await this.processWithRetry(combinedOCRText);
            return {
                combinedText: combinedOCRText,
                processedText: result.processedText,
                tags: result.tags,
                isProcessed: true
            };
        } catch (error) {
            console.error('OCR文本处理失败:', error);
            return {
                combinedText: combinedOCRText,
                processedText: combinedOCRText,
                tags: [],
                isProcessed: false
            };
        }
    }

    /**
     * 验证多模态内容
     */
    validateMultimodalContent(content: MultimodalContent): { 
        valid: boolean; 
        reason?: string 
    } {
        // 检查是否有任何内容
        const hasAudio = content.audio?.transcribedText && content.audio.transcribedText.trim().length > 0;
        const hasImages = content.images?.totalOCRText && content.images.totalOCRText.trim().length > 0;
        
        if (!hasAudio && !hasImages) {
            return { valid: false, reason: '没有音频或图片内容' };
        }

        // 检查合并文本长度
        const combinedLength = content.combinedText.length;
        if (combinedLength < 10) {
            return { valid: false, reason: '内容过短，不需要处理' };
        }

        if (combinedLength > 15000) {
            return { valid: false, reason: '内容过长，超出处理限制' };
        }

        return { valid: true };
    }

    /**
     * 生成多模态处理摘要
     */
    generateMultimodalProcessingSummary(result: MultimodalProcessingResult): string {
        const lines = [];
        
        // 内容类型
        if (result.multimodal) {
            lines.push('🎯 多模态内容 (音频 + 图片)');
        } else if (result.audioOnly) {
            lines.push('🎙️ 纯音频内容');
        } else if (result.imageOnly) {
            lines.push('🖼️ 纯图片内容');
        }
        
        // 处理状态
        if (result.isProcessed) {
            lines.push('✅ 内容已通过AI处理优化');
            
            // 内容统计
            if (result.audioText) {
                lines.push(`📊 音频文字: ${result.audioText.length}字符`);
            }
            if (result.ocrText) {
                lines.push(`📊 图片文字: ${result.ocrText.length}字符`);
            }
            lines.push(`📊 处理后长度: ${result.processedText.length}字符`);
            
            if (result.tags.length > 0) {
                lines.push(`🏷️ 生成标签: ${result.tags.length}个`);
            }
        } else {
            lines.push('📝 使用原始内容');
        }
        
        // 处理时间
        if (result.processingTime) {
            lines.push(`⏱️ 处理时间: ${result.processingTime}`);
        }
        
        return lines.join('\n');
    }

    /**
     * 格式化标签为Obsidian格式
     */
    formatTagsForObsidian(tags: string[]): string {
        if (!tags || tags.length === 0) return '';
        
        return tags
            .filter(tag => tag.trim().length > 0)
            .map(tag => `#${tag.trim().replace(/\s+/g, '_')}`) // 替换空格为下划线
            .join(' ');
    }

    /**
     * 生成处理摘要信息
     */
    generateProcessingSummary(result: {
        originalText: string;
        processedText: string;
        tags: string[];
        isProcessed: boolean;
    }): string {
        const lines = [];
        
        if (result.isProcessed) {
            lines.push('✅ 文本已通过AI处理优化');
            lines.push(`📊 原始长度: ${result.originalText.length}字符`);
            lines.push(`📊 处理后长度: ${result.processedText.length}字符`);
            
            if (result.tags.length > 0) {
                lines.push(`🏷️ 生成标签: ${result.tags.length}个`);
            }
        } else {
            lines.push('📝 使用原始转录文本');
        }
        
        return lines.join('\n');
    }
} 