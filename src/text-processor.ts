// 文本处理器 - 负责LLM文本优化和标签生成
import { DashScopeClient, TextProcessingResult } from './api-client';

export interface TextProcessorSettings {
    enableLLMProcessing: boolean;
    textModel: string;
    processOriginalText: boolean;
    generateTags: boolean;
    maxRetries: number;
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
     * 处理转录文本 - 主要入口点
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