// 文本处理器 - 负责LLM文本优化和标签生成
import { DashScopeClient, TextProcessingResult } from './api-client';

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