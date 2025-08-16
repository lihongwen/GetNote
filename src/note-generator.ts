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
     * 生成增强的笔记内容（支持YAML front matter和结构化内容）
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

        // 生成三部分内容结构
        
        // 1. 原音频部分
        if (metadata.audioFilePath) {
            content += `## 🎧 原音频\n\n`;
            content += `![[${metadata.audioFilePath}]]\n\n`;
        }

        // 2. 转录文字部分
        content += `## 📝 转录文字\n\n`;
        content += enhancedResult.originalText + '\n\n';

        // 3. 笔记概要部分
        content += `## 📋 笔记概要\n\n`;
        content += enhancedResult.summary + '\n\n';

        return content;
    }

    /**
     * 生成YAML front matter
     */
    private generateYAMLFrontMatter(
        enhancedResult: EnhancedProcessingResult,
        metadata: NoteMetadata
    ): string {
        const yaml = [];
        yaml.push('---');
        
        // 基本信息
        yaml.push(`created: ${this.formatObsidianDate(metadata.timestamp)}`);
        yaml.push(`title: "${this.escapeYamlValue(this.formatSmartTitle(enhancedResult.smartTitle, metadata.timestamp))}"`);
        yaml.push(`note_type: "voice_note"`);
        
        if (metadata.duration) {
            yaml.push(`duration: "${this.escapeYamlValue(metadata.duration)}"`);
        }
        
        // 结构化标签
        const allTags = this.combineStructuredTags(enhancedResult.structuredTags);
        if (allTags.length > 0) {
            yaml.push('tags:');
            allTags.forEach(tag => {
                yaml.push(`  - "${tag}"`);
            });
        }
        
        // AI处理信息
        yaml.push(`ai_processed: ${enhancedResult.isProcessed}`);
        yaml.push(`speech_model: "${metadata.model}"`);
        
        if (metadata.textModel && enhancedResult.isProcessed) {
            yaml.push(`text_model: "${metadata.textModel}"`);
        }
        
        // 音频文件信息
        if (metadata.audioFileName) {
            yaml.push(`audio_file: "${metadata.audioFilePath}"`);
        }
        
        // 概要信息
        if (enhancedResult.summary && enhancedResult.summary !== enhancedResult.originalText) {
            yaml.push(`summary: "${this.escapeYamlValue(enhancedResult.summary)}"`);
        }
        
        yaml.push('---');
        yaml.push('');
        
        return yaml.join('\n');
    }

    /**
     * 生成多模态笔记内容（音频+图片+OCR）
     */
    generateMultimodalNoteContent(
        multimodalContent: MultimodalContent,
        options: NoteGenerationOptions
    ): string {
        let content = '';

        // 生成YAML front matter
        content += this.generateMultimodalYAMLFrontMatter(multimodalContent, options);
        
        // 生成标题
        const title = this.formatMultimodalTitle(multimodalContent);
        content += `# ${title}\n\n`;

        // 音频部分
        if (options.includeAudioSection && multimodalContent.audio) {
            content += this.generateAudioSection(multimodalContent.audio, options.audioOptions);
        }

        // 图片部分  
        if (options.includeImageSection && multimodalContent.images && multimodalContent.images.items.length > 0) {
            content += this.generateImageSection(multimodalContent.images, options.imageOptions);
        }

        // OCR文字识别部分
        if (options.includeOCRSection && multimodalContent.images && multimodalContent.images.totalOCRText) {
            content += this.generateOCRSection(multimodalContent.images, options.imageOptions);
        }

        // 综合分析部分
        if (options.includeSummarySection && multimodalContent.combinedText) {
            content += this.generateSummarySection(multimodalContent.combinedText, options.summaryOptions);
        }

        // 元数据部分
        if (options.includeMetadata) {
            content += this.generateMetadataSection(multimodalContent.metadata);
        }

        return content;
    }

    /**
     * 生成多模态YAML front matter
     */
    private generateMultimodalYAMLFrontMatter(
        content: MultimodalContent,
        options: NoteGenerationOptions
    ): string {
        const yaml = [];
        yaml.push('---');
        
        // 基本信息
        yaml.push(`created: ${this.formatObsidianDate(content.metadata.createdAt)}`);
        yaml.push(`title: "${this.escapeYamlValue(content.metadata.hasAudio ? '多模态语音笔记' : '图片笔记')}"`);
        yaml.push(`note_type: "multimodal_note"`);
        
        // 内容类型标记
        yaml.push(`has_audio: ${content.metadata.hasAudio}`);
        yaml.push(`has_images: ${content.metadata.hasImages}`);
        yaml.push(`audio_count: ${content.metadata.audioCount}`);
        yaml.push(`image_count: ${content.metadata.imageCount}`);
        
        // 模型信息
        if (content.metadata.models.speechModel) {
            yaml.push(`speech_model: "${content.metadata.models.speechModel}"`);
        }
        if (content.metadata.models.ocrModel) {
            yaml.push(`ocr_model: "${content.metadata.models.ocrModel}"`);
        }
        if (content.metadata.models.textModel) {
            yaml.push(`text_model: "${content.metadata.models.textModel}"`);
        }
        
        // 处理时间
        if (content.metadata.totalProcessingTime) {
            yaml.push(`processing_time: "${content.metadata.totalProcessingTime}"`);
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
        let content = `## 🎧 语音录音\n\n`;
        
        if (options.includeOriginalAudio && audioData.audioFilePath) {
            content += `![[${audioData.audioFilePath}]]\n\n`;
        }
        
        if (audioData.duration) {
            content += `> 📊 录音时长: ${audioData.duration}`;
            if (audioData.processingTime) {
                content += ` | 处理时长: ${audioData.processingTime}`;
            }
            content += '\n\n';
        }

        if (options.showTranscription && audioData.transcribedText) {
            content += `### 📝 语音转录\n\n`;
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
        let content = `## 📷 图片内容\n\n`;
        
        if (options.includeOriginalImages && imageData.items.length > 0) {
            imageData.items.forEach((image, index) => {
                content += `### 图片 ${index + 1}: ${image.fileName}\n\n`;
                
                // 显示图片
                const imagePath = this.getImageDisplayPath(image);
                if (imagePath) {
                    content += `![[${imagePath}]]\n\n`;
                }
                
                // 显示图片信息
                content += `> 📊 文件大小: ${this.formatFileSize(image.fileSize)} | 类型: ${image.fileType}\n\n`;
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
        let content = `## 🔍 文字识别结果\n\n`;
        
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
                content += `### 📋 所有图片文字汇总\n\n`;
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
        let content = `## 📋 内容分析\n\n`;
        
        if (options.combineAudioAndOCR) {
            content += `### 🔄 综合处理\n\n`;
            content += '> 以下内容基于语音转录和图片文字识别的综合分析\n\n';
        }
        
        if (options.generateSummary) {
            content += `### 📝 内容摘要\n\n`;
            content += combinedText + '\n\n';
        }
        
        if (options.generateTags) {
            // 这里可以添加基于综合内容生成的标签
            content += `### 🏷️ 相关标签\n\n`;
            content += '#多模态笔记 #AI处理\n\n';
        }
        
        return content;
    }

    /**
     * 生成元数据部分
     */
    private generateMetadataSection(metadata: MultimodalContent['metadata']): string {
        let content = `## 📊 处理信息\n\n`;
        
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
        return tagName
            .trim()
            .replace(/\s+/g, '-')        // 空格替换为连字符
            .replace(/[\/\\]/g, '-')     // 斜杠替换为连字符
            .replace(/[^\w\u4e00-\u9fa5-]/g, '') // 只保留字母、数字、中文和连字符
            .replace(/-+/g, '-')         // 多个连字符合并为一个
            .replace(/^-|-$/g, '');      // 移除开头和结尾的连字符
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
     * 格式化智能标题
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
        
        return `${dateStr} ${timeStr} - ${smartTitle}`;
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
            content += `## 🎧 原音频\n\n`;
            content += `![[${metadata.audioFilePath}]]\n\n`;
            content += `> 💾 音频文件: ${metadata.audioFileName || '未知'}\n\n`;
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
            content += '> ✅ 此内容已通过AI优化处理\n\n';
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