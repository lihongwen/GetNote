import { App, TFile } from 'obsidian';

export interface NoteMetadata {
    title: string;
    timestamp: Date;
    duration?: string;
    audioSize?: string;
    processingTime?: string;
    model: string;
    textModel?: string; // AI文本处理模型
    isProcessed?: boolean; // 是否经过AI处理
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
}