import { App, TFile } from 'obsidian';
import { EnhancedProcessingResult, StructuredTags } from './text-processor';
import { ImageItem } from './image-manager';
import { OCRResult } from './api-client';
import { MultimodalContent, MultimodalNoteContent, NoteGenerationOptions } from './types';

export interface NoteMetadata {
    title: string;
    timestamp: Date;
    duration?: string;
    audioSize?: string;
    processingTime?: string;
    model: string;
    textModel?: string; // AI文本处理模型
    isProcessed?: boolean; // 是否经过AI处理
    audioFileName?: string; // 音频文件名
    audioFilePath?: string; // 音频文件相对路径
    // 图片和OCR相关元数据
    hasImages?: boolean; // 是否包含图片
    imageCount?: number; // 图片数量
    ocrModel?: string; // OCR模型
    totalOCRText?: string; // 总OCR文字长度描述
    ocrProcessingTime?: string; // OCR处理时长
    combinedProcessing?: boolean; // 是否进行了音频+OCR联合处理
}

export interface ProcessedContent {
    originalText: string;
    processedText: string;
    tags: string[];
    isProcessed: boolean;
}

export class NoteGenerator {
    constructor(private app: App) {}

    /**
     * 生成卡片式笔记内容 - 重新设计的简洁布局
     */
    generateEnhancedNoteContent(
        enhancedResult: EnhancedProcessingResult,
        metadata: NoteMetadata
    ): string {
        let content = '';

        // 生成YAML front matter
        content += this.generateYAMLFrontMatter(enhancedResult, metadata);
        
        // 生成标题
        const smartTitle = this.formatSmartTitle(enhancedResult.smartTitle, metadata.timestamp);
        content += `# ${smartTitle}\n\n`;

        // 1. 用户想法区域 - 显示原始语音转录
        content += `## 我的想法\n\n`;
        content += enhancedResult.originalText + '\n\n';

        // 2. AI分析总结区域 - 显示LLM处理后的内容
        if (enhancedResult.isProcessed) {
            content += `## AI分析总结\n\n`;
            
            // 如果有处理后的文本且与原始文本不同，显示处理后的文本
            if (enhancedResult.processedText && 
                enhancedResult.processedText !== enhancedResult.originalText) {
                content += enhancedResult.processedText + '\n\n';
            }
            
            // 如果有单独的总结且与处理后文本不同，显示总结
            if (enhancedResult.summary && 
                enhancedResult.summary !== enhancedResult.processedText &&
                enhancedResult.summary !== enhancedResult.originalText) {
                content += `**核心要点：**\n${enhancedResult.summary}\n\n`;
            }
            
            // 如果有标签，显示为Obsidian标签引用
            if (enhancedResult.tags && enhancedResult.tags.length > 0) {
                const tagLinks = enhancedResult.tags.map(tag => `#${this.normalizeTagName(tag)}`).join(' ');
                content += `**标签：** ${tagLinks}\n\n`;
            }
        }

        // 3. 录音文件链接
        if (metadata.audioFilePath) {
            content += `## 录音文件\n\n`;
            content += `![[${metadata.audioFilePath}]]\n\n`;
        }

        return content;
    }

    /**
     * 生成简化的YAML front matter - 只保留核心信息
     */
    private generateYAMLFrontMatter(
        enhancedResult: EnhancedProcessingResult,
        metadata: NoteMetadata
    ): string {
        const yaml = [];
        yaml.push('---');
        
        // 创建日期 - 核心元数据
        yaml.push(`created: ${this.formatObsidianDate(metadata.timestamp)}`);
        
        // 标签 - 优先使用AI生成的标签
        yaml.push('tags:');
        if (enhancedResult.tags && enhancedResult.tags.length > 0) {
            // 使用AI生成的内容标签
            const validTags = enhancedResult.tags
                .map(tag => this.normalizeTagName(tag))
                .filter(tag => tag && tag.length > 0);
                
            if (validTags.length > 0) {
                validTags.forEach(tag => {
                    yaml.push(`  - "${tag}"`);
                });
            } else {
                // 如果AI标签无效，使用基础标签
                yaml.push('  - "语音笔记"');
            }
        } else {
            // 如果没有AI标签，尝试使用结构化标签
            const allTags = this.combineStructuredTags(enhancedResult.structuredTags);
            if (allTags.length > 0) {
                allTags.forEach(tag => {
                    yaml.push(`  - "${tag}"`);
                });
            } else {
                // 最后回退到基础标签
                yaml.push('  - "语音笔记"');
            }
        }
        
        // 笔记类型 - 用于过滤和组织
        yaml.push(`type: "voice_note"`);
        
        yaml.push('---');
        yaml.push('');
        
        return yaml.join('\n');
    }

    /**
     * 生成卡片式多模态笔记内容 - 以用户想法为核心的布局
     */
    generateMultimodalNoteContent(
        multimodalContent: MultimodalContent,
        options: NoteGenerationOptions,
        multimodalResult?: import('./text-processor').MultimodalProcessingResult
    ): string {
        let content = '';

        // 生成YAML front matter - 传递AI生成的标签
        const aiTags = multimodalResult?.tags;
        content += this.generateMultimodalYAMLFrontMatter(multimodalContent, options, aiTags);
        
        // 生成标题 - 使用智能标题而非默认时间标题
        const title = this.formatMultimodalSmartTitle(multimodalContent);
        content += `# ${title}\n\n`;

        // 1. 用户想法区域 - 显示原始语音转录
        if (multimodalContent.audio && multimodalContent.audio.transcribedText) {
            content += `## 我的想法\n\n`;
            content += multimodalContent.audio.transcribedText + '\n\n';
        }

        // 2. AI分析总结区域 - 显示LLM处理后的内容
        if (multimodalResult && multimodalResult.isProcessed) {
            content += `## AI分析总结\n\n`;
            
            // 如果有处理后的文本且与原始文本不同，显示处理后的文本
            if (multimodalResult.processedText && 
                multimodalResult.processedText !== multimodalResult.audioText) {
                content += multimodalResult.processedText + '\n\n';
            }
            
            // 如果有单独的总结且与处理后文本不同，显示总结
            if (multimodalResult.summary && 
                multimodalResult.summary !== multimodalResult.processedText &&
                multimodalResult.summary !== multimodalResult.audioText) {
                content += `**核心要点：**\n${multimodalResult.summary}\n\n`;
            }
            
            // 如果有标签，显示为Obsidian标签引用
            if (multimodalResult.tags && multimodalResult.tags.length > 0) {
                const tagLinks = multimodalResult.tags.map(tag => `#${this.normalizeTagName(tag)}`).join(' ');
                content += `**标签：** ${tagLinks}\n\n`;
            }
        }

        // 3. 参考内容区域 - 图片OCR内容
        if (options.includeOCRSection && multimodalContent.images && multimodalContent.images.totalOCRText) {
            content += `## 参考内容\n\n`;
            content += `> 来自图片的文字内容，作为想法的背景参考\n\n`;
            content += multimodalContent.images.totalOCRText + '\n\n';
        }

        // 4. 相关文件区域 - 音频和图片链接
        const hasFiles = (multimodalContent.audio && options.audioOptions.includeOriginalAudio) || 
                         (multimodalContent.images && options.imageOptions.includeOriginalImages);
        
        if (hasFiles) {
            content += `## 相关文件\n\n`;
            
            // 音频文件
            if (options.includeAudioSection && multimodalContent.audio && options.audioOptions.includeOriginalAudio) {
                if (multimodalContent.audio.audioFilePath) {
                    content += `**录音**: ![[${multimodalContent.audio.audioFilePath}]]\n\n`;
                }
            }
            
            // 图片文件
            if (options.includeImageSection && multimodalContent.images && options.imageOptions.includeOriginalImages) {
                if (multimodalContent.images.items.length > 0) {
                    content += `**图片**: `;
                    const imageLinks = multimodalContent.images.items
                        .map(image => this.getImageDisplayPath(image))
                        .filter(path => path)
                        .map(path => `![[${path}]]`)
                        .join(' ');
                    content += imageLinks + '\n\n';
                }
            }
        }

        return content;
    }

    /**
     * 生成简化的多模态YAML front matter - 只保留核心信息
     */
    private generateMultimodalYAMLFrontMatter(
        content: MultimodalContent,
        options: NoteGenerationOptions,
        aiTags?: string[]
    ): string {
        const yaml = [];
        yaml.push('---');
        
        // 创建日期 - 核心元数据
        yaml.push(`created: ${this.formatObsidianDate(content.metadata.createdAt)}`);
        
        // 标签 - 优先使用AI生成的标签
        yaml.push('tags:');
        if (aiTags && aiTags.length > 0) {
            // 使用AI生成的内容标签
            const validTags = aiTags
                .map(tag => this.normalizeTagName(tag))
                .filter(tag => tag && tag.length > 0);
                
            if (validTags.length > 0) {
                validTags.forEach(tag => {
                    yaml.push(`  - "${tag}"`);
                });
            } else {
                // 如果AI标签无效，使用类型标签
                this.addFallbackTags(yaml, content);
            }
        } else {
            // 如果没有AI标签，使用类型标签
            if (content.metadata.hasAudio && content.metadata.hasImages) {
                yaml.push('  - "多模态笔记"');
                yaml.push('  - "语音笔记"');
                yaml.push('  - "图片笔记"');
            } else if (content.metadata.hasAudio) {
                yaml.push('  - "语音笔记"');
            } else if (content.metadata.hasImages) {
                yaml.push('  - "图片笔记"');
            }
        }
        
        // 笔记类型 - 用于过滤和组织
        if (content.metadata.hasAudio && content.metadata.hasImages) {
            yaml.push(`type: "multimodal_note"`);
        } else if (content.metadata.hasAudio) {
            yaml.push(`type: "voice_note"`);
        } else {
            yaml.push(`type: "image_note"`);
        }
        
        yaml.push('---');
        yaml.push('');
        
        return yaml.join('\n');
    }

    /**
     * 生成音频部分
     */
    private generateAudioSection(
        audioData: NonNullable<MultimodalContent['audio']>,
        options: NoteGenerationOptions['audioOptions']
    ): string {
        let content = `## 语音录音\n\n`;
        
        if (options.includeOriginalAudio && audioData.audioFilePath) {
            content += `![[${audioData.audioFilePath}]]\n\n`;
        }
        
        if (audioData.duration) {
            content += `> 录音时长: ${audioData.duration}`;
            if (audioData.processingTime) {
                content += ` | 处理时长: ${audioData.processingTime}`;
            }
            content += '\n\n';
        }

        if (options.showTranscription && audioData.transcribedText) {
            content += `### 语音转录\n\n`;
            content += audioData.transcribedText + '\n\n';
        }
        
        return content;
    }

    /**
     * 生成图片部分
     */
    private generateImageSection(
        imageData: NonNullable<MultimodalContent['images']>,
        options: NoteGenerationOptions['imageOptions']
    ): string {
        let content = `## 图片内容\n\n`;
        
        if (options.includeOriginalImages && imageData.items.length > 0) {
            imageData.items.forEach((image, index) => {
                content += `### 图片 ${index + 1}: ${image.fileName}\n\n`;
                
                // 显示图片
                const imagePath = this.getImageDisplayPath(image);
                if (imagePath) {
                    content += `![[${imagePath}]]\n\n`;
                }
                
                // 显示图片信息
                content += `> 文件大小: ${this.formatFileSize(image.fileSize)} | 类型: ${image.fileType}\n\n`;
            });
        }
        
        return content;
    }

    /**
     * 生成OCR部分
     */
    private generateOCRSection(
        imageData: NonNullable<MultimodalContent['images']>,
        options: NoteGenerationOptions['imageOptions']
    ): string {
        let content = `## 文字识别结果\n\n`;
        
        if (options.showOCRText && imageData.ocrResults.size > 0) {
            imageData.items.forEach((image, index) => {
                const ocrResult = imageData.ocrResults.get(image.id);
                if (ocrResult && ocrResult.text.trim()) {
                    content += `### 图片 ${index + 1} 识别文字\n\n`;
                    content += `> 来源: ${image.fileName}\n\n`;
                    content += ocrResult.text + '\n\n';
                }
            });
            
            // 合并的OCR文字
            if (imageData.totalOCRText && imageData.totalOCRText.trim()) {
                content += `### 所有图片文字汇总\n\n`;
                content += imageData.totalOCRText + '\n\n';
            }
        }
        
        return content;
    }

    /**
     * 生成综合分析部分
     */
    private generateSummarySection(
        combinedText: string,
        options: NoteGenerationOptions['summaryOptions']
    ): string {
        let content = `## 内容分析\n\n`;
        
        if (options.combineAudioAndOCR) {
            content += `### 综合处理\n\n`;
            content += '> 以下内容基于语音转录和图片文字识别的综合分析\n\n';
        }
        
        if (options.generateSummary) {
            content += `### 内容摘要\n\n`;
            content += combinedText + '\n\n';
        }
        
        if (options.generateTags) {
            // 这里可以添加基于综合内容生成的标签
            content += `### 相关标签\n\n`;
            content += '#多模态笔记 #AI处理\n\n';
        }
        
        return content;
    }

    /**
     * 生成元数据部分
     */
    private generateMetadataSection(metadata: MultimodalContent['metadata']): string {
        let content = `## 处理信息\n\n`;
        
        const info = [];
        info.push(`**创建时间**: ${metadata.createdAt.toLocaleString()}`);
        
        if (metadata.hasAudio) {
            info.push(`**包含音频**: 是 (${metadata.audioCount} 个)`);
        }
        
        if (metadata.hasImages) {
            info.push(`**包含图片**: 是 (${metadata.imageCount} 张)`);
        }
        
        if (metadata.totalProcessingTime) {
            info.push(`**总处理时长**: ${metadata.totalProcessingTime}`);
        }
        
        const models = [];
        if (metadata.models.speechModel) models.push(`语音: ${metadata.models.speechModel}`);
        if (metadata.models.ocrModel) models.push(`OCR: ${metadata.models.ocrModel}`);
        if (metadata.models.textModel) models.push(`文本: ${metadata.models.textModel}`);
        
        if (models.length > 0) {
            info.push(`**AI模型**: ${models.join(' | ')}`);
        }
        
        content += info.join('\n') + '\n\n';
        content += '---\n';
        content += '*由 GetNote 插件自动生成*\n\n';
        
        return content;
    }

    /**
     * 格式化多模态标题
     */
    private formatMultimodalTitle(content: MultimodalContent): string {
        const dateStr = content.metadata.createdAt.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\//g, '-');
        
        const timeStr = content.metadata.createdAt.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        const typeLabels = [];
        if (content.metadata.hasAudio) typeLabels.push('语音');
        if (content.metadata.hasImages) typeLabels.push('图片');
        
        const typeLabel = typeLabels.length > 1 ? '多模态' : typeLabels[0] || '笔记';
        
        return `${dateStr} ${timeStr} - ${typeLabel}笔记`;
    }

    /**
     * 格式化多模态智能标题 - 尝试从内容提取有意义的标题
     */
    private formatMultimodalSmartTitle(content: MultimodalContent): string {
        const dateStr = content.metadata.createdAt.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\//g, '-');
        
        const timeStr = content.metadata.createdAt.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        // 尝试从组合文本或音频文本中提取标题
        let smartTitle = '';
        if (content.combinedText && content.combinedText.trim()) {
            smartTitle = this.extractTitleFromContent(content.combinedText);
        } else if (content.audio && content.audio.transcribedText) {
            smartTitle = this.extractTitleFromContent(content.audio.transcribedText);
        }
        
        // 如果提取失败，使用类型标签
        if (!smartTitle || smartTitle === '语音笔记') {
            const typeLabels = [];
            if (content.metadata.hasAudio) typeLabels.push('语音');
            if (content.metadata.hasImages) typeLabels.push('图片');
            const typeLabel = typeLabels.length > 1 ? '多模态' : typeLabels[0] || '笔记';
            smartTitle = `${typeLabel}笔记`;
        }
        
        // 清理智能标题
        smartTitle = this.cleanSmartTitle(smartTitle);
        
        return `${dateStr} ${timeStr} - ${smartTitle}`;
    }

    /**
     * 获取图片显示路径
     */
    private getImageDisplayPath(image: ImageItem): string | null {
        // 如果图片已保存到vault，返回vault中的路径
        // 检查图片是否有vault路径信息
        if (image.vaultPath) {
            return image.vaultPath;
        }
        return null;
    }

    /**
     * 合并结构化标签为扁平数组
     */
    private combineStructuredTags(structuredTags: StructuredTags): string[] {
        const tags: string[] = [];
        
        // 人物标签
        structuredTags.people.forEach(person => {
            tags.push(`人物-${this.normalizeTagName(person)}`);
        });
        
        // 事件标签
        structuredTags.events.forEach(event => {
            tags.push(`事件-${this.normalizeTagName(event)}`);
        });
        
        // 主题标签
        structuredTags.topics.forEach(topic => {
            tags.push(`主题-${this.normalizeTagName(topic)}`);
        });
        
        // 时间标签
        structuredTags.times.forEach(time => {
            tags.push(`时间-${this.normalizeTagName(time)}`);
        });
        
        // 地点标签
        structuredTags.locations.forEach(location => {
            tags.push(`地点-${this.normalizeTagName(location)}`);
        });
        
        // 默认标签
        tags.push('语音笔记');
        
        return tags;
    }

    /**
     * 规范化标签名称，确保Obsidian兼容性
     */
    private normalizeTagName(tagName: string): string {
        if (!tagName || typeof tagName !== 'string') {
            return '';
        }
        
        let normalized = tagName
            .trim()
            .replace(/^#/, '')           // 移除可能存在的#前缀
            .replace(/\s+/g, '')         // 移除所有空格（中文标签不需要连字符）
            .replace(/[\/\\]/g, '-')     // 斜杠替换为连字符
            .replace(/[^\w\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff-]/g, '') // 保留字母、数字、中文、假名和连字符
            .replace(/-+/g, '-')         // 多个连字符合并为一个
            .replace(/^-|-$/g, '');      // 移除开头和结尾的连字符
            
        // 如果处理后为空或过短，返回空字符串
        if (!normalized || normalized.length < 1) {
            return '';
        }
        
        // 限制标签长度
        if (normalized.length > 15) {
            normalized = normalized.substring(0, 15);
        }
        
        return normalized;
    }

    /**
     * 添加后备标签
     */
    private addFallbackTags(yaml: string[], content: MultimodalContent): void {
        if (content.metadata.hasAudio && content.metadata.hasImages) {
            yaml.push('  - "多模态笔记"');
            yaml.push('  - "语音笔记"');
            yaml.push('  - "图片笔记"');
        } else if (content.metadata.hasAudio) {
            yaml.push('  - "语音笔记"');
        } else if (content.metadata.hasImages) {
            yaml.push('  - "图片笔记"');
        }
    }

    /**
     * 转义YAML值，确保兼容性
     */
    private escapeYamlValue(value: string): string {
        return value
            .replace(/\\/g, '\\\\')      // 转义反斜杠
            .replace(/"/g, '\\"')        // 转义双引号
            .replace(/\n/g, '\\n')       // 转义换行符
            .replace(/\r/g, '\\r')       // 转义回车符
            .replace(/\t/g, '\\t');      // 转义制表符
    }

    /**
     * 格式化Obsidian标准日期格式
     */
    private formatObsidianDate(timestamp: Date): string {
        const year = timestamp.getFullYear();
        const month = String(timestamp.getMonth() + 1).padStart(2, '0');
        const day = String(timestamp.getDate()).padStart(2, '0');
        const hour = String(timestamp.getHours()).padStart(2, '0');
        const minute = String(timestamp.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hour}:${minute}`;
    }

    /**
     * 格式化智能标题 - 时间戳 + LLM生成的内容标题
     */
    private formatSmartTitle(smartTitle: string, timestamp: Date): string {
        const dateStr = timestamp.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\//g, '-');
        
        const timeStr = timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        // 清理和优化LLM生成的标题
        const cleanTitle = this.cleanSmartTitle(smartTitle);
        
        return `${dateStr} ${timeStr} - ${cleanTitle}`;
    }

    /**
     * 清理和优化智能标题
     */
    private cleanSmartTitle(title: string): string {
        if (!title || title.trim().length === 0) {
            return '语音笔记';
        }
        
        let cleaned = title.trim();
        
        // 移除常见的AI生成前缀
        const prefixesToRemove = [
            '标题：', '题目：', '主题：', '内容：', '关于：',
            '标题:', '题目:', '主题:', '内容:', '关于:',
            'Title:', 'Subject:', 'Topic:', 'About:'
        ];
        
        for (const prefix of prefixesToRemove) {
            if (cleaned.startsWith(prefix)) {
                cleaned = cleaned.substring(prefix.length).trim();
                break;
            }
        }
        
        // 移除引号
        cleaned = cleaned.replace(/^["'「『]|["'」』]$/g, '');
        
        // 限制长度到25个字符，保持标题简洁
        if (cleaned.length > 25) {
            cleaned = cleaned.substring(0, 22) + '...';
        }
        
        // 如果清理后为空，使用默认标题
        return cleaned.length > 0 ? cleaned : '语音笔记';
    }

    /**
     * 生成笔记内容（新版本，支持AI处理结果）
     */
    generateNoteContentWithAI(
        processedContent: ProcessedContent,
        metadata: NoteMetadata,
        includeMetadata: boolean = true
    ): string {
        const { title, timestamp, duration, model, textModel, isProcessed } = metadata;
        
        let content = '';

        // 添加标题
        content += `# ${title}\n\n`;

        // 添加AI生成的标签（如果有）
        if (processedContent.tags && processedContent.tags.length > 0) {
            content += this.formatTagsForObsidian(processedContent.tags) + '\n\n';
        } else {
            content += '#语音笔记\n\n';
        }

        // 音频文件链接（如果有）
        if (metadata.audioFilePath) {
            content += `## 原音频\n\n`;
            content += `![[${metadata.audioFilePath}]]\n\n`;
            content += `> 音频文件: ${metadata.audioFileName || '未知'}\n\n`;
        }

        // 简化的元数据（可选）
        if (includeMetadata) {
            content += `创建时间: ${timestamp.toLocaleString()}`;
            if (duration) {
                content += ` | 时长: ${duration}`;
            }
            content += ` | 语音模型: ${model}`;
            if (processedContent.isProcessed && textModel) {
                content += ` | 文本模型: ${textModel}`;
            }
            content += '\n\n';
        }

        // 添加处理状态说明
        if (processedContent.isProcessed) {
            content += '> 此内容已通过AI优化处理\n\n';
        }

        // 添加处理后的内容
        const textToUse = processedContent.isProcessed ? processedContent.processedText : processedContent.originalText;
        content += '## 内容\n\n';
        content += this.formatAIResponse(textToUse);
        content += '\n\n';

        // 如果启用了AI处理，添加原始内容对比（可选）
        if (processedContent.isProcessed && processedContent.originalText !== processedContent.processedText) {
            content += '## 原始转录\n\n';
            content += '> 原始语音转录内容\n\n';
            content += processedContent.originalText;
            content += '\n\n';
        }

        return content;
    }

    /**
     * 生成笔记内容（向后兼容版本）
     */
    generateNoteContent(
        aiResponse: string, 
        metadata: NoteMetadata,
        includeMetadata: boolean = true
    ): string {
        // 转换为新格式
        const processedContent: ProcessedContent = {
            originalText: aiResponse,
            processedText: aiResponse,
            tags: [],
            isProcessed: false
        };

        return this.generateNoteContentWithAI(processedContent, metadata, includeMetadata);
    }

    /**
     * 格式化AI响应内容
     */
    private formatAIResponse(response: string): string {
        // 如果AI已经返回了格式化的内容，直接使用
        if (this.isAlreadyFormatted(response)) {
            return response;
        }

        // 否则进行基本格式化
        let formatted = response.trim();

        // 添加段落间距
        formatted = formatted.replace(/\n\n/g, '\n\n');
        
        // 处理列表项（如果AI没有正确格式化）
        formatted = formatted.replace(/^(\d+\.|[-*])\s*/gm, '- ');
        
        // 确保标题格式正确
        formatted = formatted.replace(/^([^\n]+)(?=\n[-=]{2,})/gm, '## $1');
        
        return formatted;
    }

    /**
     * 检查内容是否已经格式化
     */
    private isAlreadyFormatted(content: string): boolean {
        // 检查是否包含Markdown格式标记
        const markdownPatterns = [
            /^#+\s/m,           // 标题
            /^\s*[-*+]\s/m,     // 列表
            /^\s*\d+\.\s/m,     // 有序列表
            /\*\*.*\*\*/,       // 粗体
            /\*.*\*/,           // 斜体
            /`.*`/,             // 代码
        ];

        return markdownPatterns.some(pattern => pattern.test(content));
    }

    /**
     * 生成文件名
     */
    generateFileName(prefix: string = '语音笔记', timestamp?: Date): string {
        const date = timestamp || new Date();
        const dateStr = date.getFullYear() + '-' +
                       String(date.getMonth() + 1).padStart(2, '0') + '-' +
                       String(date.getDate()).padStart(2, '0');
        const timeStr = String(date.getHours()).padStart(2, '0') + '-' +
                       String(date.getMinutes()).padStart(2, '0') + '-' +
                       String(date.getSeconds()).padStart(2, '0');
        
        return `${prefix}_${dateStr}_${timeStr}.md`;
    }

    /**
     * 确保目标文件夹存在
     */
    async ensureFolderExists(folderPath: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }
    }

    /**
     * 保存笔记到文件
     */
    async saveNote(
        content: string, 
        folderPath: string, 
        fileName: string
    ): Promise<TFile> {
        // 确保文件夹存在
        await this.ensureFolderExists(folderPath);
        
        // 构建完整文件路径
        const filePath = `${folderPath}/${fileName}`;
        
        // 检查文件是否已存在，如果存在则添加序号
        const finalPath = await this.getUniqueFilePath(filePath);
        
        // 创建文件
        return await this.app.vault.create(finalPath, content);
    }

    /**
     * 获取唯一的文件路径（避免重名）
     */
    private async getUniqueFilePath(originalPath: string): Promise<string> {
        let counter = 1;
        let testPath = originalPath;
        
        while (this.app.vault.getAbstractFileByPath(testPath)) {
            const pathParts = originalPath.split('.');
            const extension = pathParts.pop();
            const basePath = pathParts.join('.');
            testPath = `${basePath}_${counter}.${extension}`;
            counter++;
        }
        
        return testPath;
    }

    /**
     * 格式化标签为Obsidian格式
     */
    formatTagsForObsidian(tags: string[]): string {
        if (!tags || tags.length === 0) return '#语音笔记';
        
        const formattedTags = tags
            .filter(tag => tag.trim().length > 0)
            .map(tag => `#${tag.trim().replace(/\s+/g, '_')}`) // 替换空格为下划线
            .join(' ');
        
        // 确保至少有一个语音笔记标签
        if (!formattedTags.includes('#语音笔记')) {
            return `${formattedTags} #语音笔记`;
        }
        
        return formattedTags;
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化持续时间
     */
    formatDuration(milliseconds: number): string {
        if (milliseconds < 1000) {
            return `${milliseconds}ms`;
        }
        
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}时${minutes % 60}分${seconds % 60}秒`;
        } else if (minutes > 0) {
            return `${minutes}分${seconds % 60}秒`;
        } else {
            return `${seconds}秒`;
        }
    }

    /**
     * 从音频内容提取可能的标题
     */
    extractTitleFromContent(content: string): string {
        // 尝试从内容中提取第一行作为标题
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length > 0) {
            let firstLine = lines[0].trim();
            
            // 移除可能的标题标记
            firstLine = firstLine.replace(/^#+\s*/, '');
            
            // 限制标题长度
            if (firstLine.length > 50) {
                firstLine = firstLine.substring(0, 47) + '...';
            }
            
            return firstLine || '语音笔记';
        }
        
        return '语音笔记';
    }

    /**
     * 创建笔记模板
     */
    createNoteTemplate(templateType: 'meeting' | 'idea' | 'todo' | 'general' = 'general'): string {
        const templates = {
            meeting: `# 会议笔记

时间: 
参与者: 
议题: 

## 内容

## 决定

## 待办

`,

            idea: `# 创意想法

## 核心想法

## 详细描述

## 下一步

`,

            todo: `# 待办

## 紧急
- [ ] 

## 重要
- [ ] 

## 其他
- [ ] 

`,

            general: `# 语音笔记

## 内容

## 要点

`
        };

        return templates[templateType];
    }

    /**
     * 保存音频文件到vault
     */
    async saveAudioFile(
        audioBlob: Blob,
        folderPath: string,
        fileName: string
    ): Promise<{ audioFile: TFile, audioFilePath: string }> {
        // 确保音频文件夹存在
        const audioFolderPath = `${folderPath}/audio`;
        await this.ensureFolderExists(audioFolderPath);
        
        // 检测音频格式
        const audioFormat = this.detectAudioFormat(audioBlob);
        const audioFileName = fileName.replace('.md', audioFormat);
        
        // 构建完整音频文件路径
        const fullAudioPath = `${audioFolderPath}/${audioFileName}`;
        
        // 检查文件是否已存在，如果存在则添加序号
        const finalAudioPath = await this.getUniqueFilePath(fullAudioPath);
        
        // 将Blob转换为ArrayBuffer
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        // 创建音频文件
        const audioFile = await this.app.vault.createBinary(finalAudioPath, arrayBuffer);
        
        // 返回相对于笔记文件夹的路径
        const relativePath = finalAudioPath.replace(`${folderPath}/`, '');
        
        return { audioFile, audioFilePath: relativePath };
    }

    /**
     * 检测音频格式并返回对应的文件扩展名
     */
    private detectAudioFormat(audioBlob: Blob): string {
        const mimeType = audioBlob.type.toLowerCase();
        
        if (mimeType.includes('webm')) {
            return '.webm';
        } else if (mimeType.includes('wav')) {
            return '.wav';
        } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
            return '.mp3';
        } else if (mimeType.includes('ogg')) {
            return '.ogg';
        } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
            return '.m4a';
        } else {
            // 默认使用webm格式
            return '.webm';
        }
    }

    /**
     * 生成音频文件名（基于笔记文件名）
     */
    generateAudioFileName(noteFileName: string): string {
        // 将.md替换为对应的音频格式，在saveAudioFile中会根据实际格式调整
        return noteFileName.replace('.md', '.webm');
    }

    /**
     * 保存图片文件到vault
     */
    async saveImageFile(
        image: ImageItem,
        folderPath: string,
        fileName?: string
    ): Promise<{ imageFile: TFile, imageFilePath: string, relativePath: string }> {
        // 确保图片文件夹存在
        const imageFolderPath = `${folderPath}/images`;
        await this.ensureFolderExists(imageFolderPath);
        
        // 生成图片文件名
        const imageFileName = fileName || this.generateImageFileName(image);
        
        // 构建完整图片文件路径
        const fullImagePath = `${imageFolderPath}/${imageFileName}`;
        
        // 检查文件是否已存在，如果存在则添加序号
        const finalImagePath = await this.getUniqueFilePath(fullImagePath);
        
        // 将File对象转换为ArrayBuffer
        const arrayBuffer = await image.file.arrayBuffer();
        
        // 创建图片文件
        const imageFile = await this.app.vault.createBinary(finalImagePath, arrayBuffer);
        
        // 返回相对于vault根目录的路径
        const relativePath = finalImagePath;
        
        // 更新ImageItem的vault信息
        image.vaultPath = relativePath;
        image.vaultFile = imageFile;
        
        return { imageFile, imageFilePath: relativePath, relativePath };
    }

    /**
     * 批量保存图片到vault
     */
    async saveImagesToVault(
        images: ImageItem[],
        folderPath: string
    ): Promise<{
        savedImages: Array<{ image: ImageItem, file: TFile, path: string }>;
        errors: Array<{ image: ImageItem, error: string }>;
    }> {
        const savedImages: Array<{ image: ImageItem, file: TFile, path: string }> = [];
        const errors: Array<{ image: ImageItem, error: string }> = [];

        for (const image of images) {
            try {
                const result = await this.saveImageFile(image, folderPath);
                savedImages.push({
                    image,
                    file: result.imageFile,
                    path: result.imageFilePath
                });
                
                console.log(`保存图片成功: ${image.fileName} -> ${result.imageFilePath}`);
            } catch (error) {
                const errorMsg = `保存图片失败: ${error.message}`;
                errors.push({ image, error: errorMsg });
                console.error(`保存图片失败: ${image.fileName}`, error);
            }
        }

        return { savedImages, errors };
    }

    /**
     * 生成图片文件名
     */
    generateImageFileName(image: ImageItem): string {
        // 获取文件扩展名
        const extension = this.getImageFileExtension(image.fileType);
        
        // 使用时间戳和原文件名生成唯一文件名
        const timestamp = image.addedAt.getTime();
        const baseName = image.fileName.replace(/\.[^/.]+$/, ''); // 移除原扩展名
        const safeName = this.sanitizeFileName(baseName);
        
        return `${timestamp}_${safeName}${extension}`;
    }

    /**
     * 根据MIME类型获取文件扩展名
     */
    private getImageFileExtension(mimeType: string): string {
        const extensions: { [key: string]: string } = {
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/bmp': '.bmp',
            'image/tiff': '.tiff'
        };
        
        return extensions[mimeType.toLowerCase()] || '.jpg';
    }

    /**
     * 清理文件名，移除不安全字符
     */
    private sanitizeFileName(fileName: string): string {
        return fileName
            .replace(/[<>:"/\\|?*]/g, '_') // 替换Windows不安全字符
            .replace(/\s+/g, '_') // 替换空格
            .replace(/_{2,}/g, '_') // 合并多个下划线
            .replace(/^_|_$/g, '') // 移除开头和结尾的下划线
            .slice(0, 50); // 限制长度
    }

    /**
     * 生成多模态笔记并保存所有资源
     */
    async generateAndSaveMultimodalNote(
        multimodalContent: MultimodalContent,
        options: NoteGenerationOptions,
        folderPath: string,
        fileName: string
    ): Promise<{
        noteFile: TFile;
        savedImages: Array<{ image: ImageItem, file: TFile, path: string }>;
        audioFile?: TFile;
        errors: string[];
    }> {
        const errors: string[] = [];
        let savedImages: Array<{ image: ImageItem, file: TFile, path: string }> = [];
        let audioFile: TFile | undefined;

        try {
            // 1. 保存图片文件
            if (multimodalContent.images && multimodalContent.images.items.length > 0) {
                const imageResult = await this.saveImagesToVault(multimodalContent.images.items, folderPath);
                savedImages = imageResult.savedImages;
                
                if (imageResult.errors.length > 0) {
                    errors.push(...imageResult.errors.map(e => e.error));
                }
            }

            // 2. 保存音频文件（如果有）
            if (multimodalContent.audio && multimodalContent.audio.audioBlob) {
                try {
                    const audioResult = await this.saveAudioFile(
                        multimodalContent.audio.audioBlob,
                        folderPath,
                        fileName.replace('.md', '.webm')
                    );
                    audioFile = audioResult.audioFile;
                    
                    // 更新音频路径信息
                    if (multimodalContent.audio) {
                        multimodalContent.audio.audioFilePath = audioResult.audioFilePath;
                    }
                } catch (error) {
                    errors.push(`音频保存失败: ${error.message}`);
                }
            }

            // 3. 生成笔记内容
            const noteContent = this.generateMultimodalNoteContent(multimodalContent, options);

            // 4. 保存笔记文件
            const noteFile = await this.saveNote(noteContent, folderPath, fileName);

            return {
                noteFile,
                savedImages,
                audioFile,
                errors
            };

        } catch (error) {
            errors.push(`笔记生成失败: ${error.message}`);
            throw new Error(`多模态笔记保存失败: ${errors.join(', ')}`);
        }
    }

    /**
     * 创建默认的笔记生成选项
     */
    createDefaultNoteOptions(settings: {
        includeOCRInNote: boolean;
        showOriginalImages: boolean;
        combineAudioAndOCR: boolean;
        keepOriginalAudio: boolean;
        includeMetadata: boolean;
    }): NoteGenerationOptions {
        return {
            includeAudioSection: true,
            includeOCRSection: settings.includeOCRInNote,
            includeImageSection: settings.showOriginalImages,
            includeSummarySection: settings.combineAudioAndOCR,
            includeMetadata: settings.includeMetadata,
            audioOptions: {
                includeOriginalAudio: settings.keepOriginalAudio,
                showTranscription: true
            },
            imageOptions: {
                includeOriginalImages: settings.showOriginalImages,
                showOCRText: settings.includeOCRInNote,
                thumbnailSize: 'medium'
            },
            summaryOptions: {
                generateTags: true,
                generateSummary: true,
                combineAudioAndOCR: settings.combineAudioAndOCR
            }
        };
    }

    /**
     * 检查是否支持保存二进制文件
     */
    static isAudioSaveSupported(): boolean {
        return typeof ArrayBuffer !== 'undefined';
    }
}