// DashScope API客户端
import { requestUrl } from 'obsidian';

export interface DashScopeMessage {
    role: 'user' | 'assistant' | 'system';
    content: Array<{
        audio?: string;
        text?: string;
    }>;
}

export interface DashScopeRequest {
    model: string;
    input: {
        messages: DashScopeMessage[];
    };
}

export interface DashScopeResponse {
    output: {
        choices: Array<{
            finish_reason: string;
            message: {
                role: string;
                content: Array<{
                    text?: string;
                    audio?: string;
                }>;
            };
        }>;
    };
    usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
    request_id: string;
}

// 兼容模式文本API的消息接口
export interface CompatibleMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// 兼容模式API请求接口
export interface CompatibleRequest {
    model: string;
    messages: CompatibleMessage[];
}

// 兼容模式API响应接口
export interface CompatibleResponse {
    choices: Array<{
        finish_reason: string;
        message: {
            role: string;
            content: string;
        };
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    id: string;
}

// 文本处理结果接口
export interface TextProcessingResult {
    processedText: string;
    tags: string[];
}

export class DashScopeClient {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    private readonly compatibleUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async processAudio(audioBlob: Blob, prompt: string = ''): Promise<string> {
        try {
            // 检测音频类型并转换为base64
            const audioType = this.detectAudioType(audioBlob);
            const audioBase64 = await this.blobToBase64(audioBlob);
            
            console.log(`处理音频: 类型=${audioType}, 大小=${audioBlob.size}字节`);
            
            // qwen-audio-asr-latest 专门用于语音转文字，使用简化的请求格式
            const request: DashScopeRequest = {
                model: 'qwen-audio-asr-latest',
                input: {
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    audio: `data:${audioType};base64,${audioBase64}`
                                }
                            ]
                        }
                    ]
                }
            };

            console.log('=== 音频处理API调试信息 ===');
            console.log('请求URL:', this.baseUrl);
            console.log('请求对象 (request):', request);
            console.log('请求JSON字符串:', JSON.stringify(request, null, 2));
            console.log('========================');
            
            console.log('发送API请求到:', this.baseUrl);
            const requestBody = JSON.stringify(request);
            
            const response = await requestUrl({
                url: this.baseUrl,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: requestBody,
                throw: false // 手动处理HTTP错误
            });

            console.log('API响应状态:', response.status);

            if (response.status >= 400) {
                console.error('API错误详情:', response.text);
                throw new Error(`API请求失败 (${response.status}): ${response.text}`);
            }

            const data: DashScopeResponse = response.json;
            console.log('API响应数据:', JSON.stringify(data, null, 2));
            
            // 根据官方文档，content是数组格式
            if (data.output?.choices?.[0]?.message?.content?.[0]?.text) {
                return data.output.choices[0].message.content[0].text;
            } else {
                console.error('API返回格式异常:', data);
                throw new Error('API返回数据格式异常');
            }

        } catch (error) {
            console.error('DashScope API调用失败:', error);
            
            // 提供更详细的错误信息
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                throw new Error('网络连接失败，请检查网络状态和API Key是否正确');
            } else if (error.message.includes('401')) {
                throw new Error('API Key无效，请检查您的密钥配置');
            } else if (error.message.includes('429')) {
                throw new Error('API调用频率超限，请稍后重试');
            } else {
                throw new Error(`音频处理失败: ${error.message}`);
            }
        }
    }

    private detectAudioType(blob: Blob): string {
        // 如果blob已经有type，直接使用
        if (blob.type && blob.type.startsWith('audio/')) {
            return blob.type;
        }
        
        // 默认使用wav格式，这是录音常用格式
        // 根据官方文档，支持多种格式：AMR、WAV、3GP、AAC、MP3等
        return 'audio/wav';
    }

    private async blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // 移除data:audio/xxx;base64,前缀，只保留base64部分
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // 测试API连接
    async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            console.log('开始API连接测试...');
            
            // 使用官方文档中的测试音频URL进行测试 - qwen-audio-asr专门用于语音转文字
            const testRequest: DashScopeRequest = {
                model: 'qwen-audio-asr-latest',
                input: {
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    audio: "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3"
                                }
                            ]
                        }
                    ]
                }
            };

            console.log('=== API调试信息 ===');
            console.log('请求URL:', this.baseUrl);
            console.log('请求对象 (testRequest):', testRequest);
            console.log('请求JSON字符串:', JSON.stringify(testRequest, null, 2));
            console.log('=================');
            
            console.log('发送测试请求...');
            const requestBody = JSON.stringify(testRequest);
            const response = await requestUrl({
                url: this.baseUrl,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: requestBody,
                throw: false // 手动处理HTTP错误
            });

            console.log('测试响应状态:', response.status);

            if (response.status >= 400) {
                console.error('测试请求失败:', response.text);
                return { 
                    success: false, 
                    error: `HTTP ${response.status}: ${response.text}` 
                };
            }

            const data: DashScopeResponse = response.json;
            console.log('测试响应数据:', JSON.stringify(data, null, 2));
            
            if (data.output?.choices?.[0]?.message?.content?.[0]?.text) {
                console.log('API测试成功，返回内容:', data.output.choices[0].message.content[0].text);
                return { success: true };
            } else {
                return { 
                    success: false, 
                    error: '响应格式异常' 
                };
            }

        } catch (error) {
            console.error('API连接测试失败:', error);
            
            let errorMessage = '未知错误';
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                errorMessage = '网络连接失败，请检查网络状态';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            return { 
                success: false, 
                error: errorMessage 
            };
        }
    }

    // 获取支持的音频格式
    getSupportedAudioFormats(): string[] {
        return [
            'audio/wav',
            'audio/mp3',
            'audio/m4a',
            'audio/flac',
            'audio/ogg'
        ];
    }

    // 检查音频文件大小限制（DashScope通常有文件大小限制）
    checkAudioSize(audioBlob: Blob): { valid: boolean; message?: string } {
        const maxSize = 10 * 1024 * 1024; // 10MB限制
        
        if (audioBlob.size > maxSize) {
            return {
                valid: false,
                message: `音频文件过大，最大支持${maxSize / 1024 / 1024}MB`
            };
        }

        return { valid: true };
    }

    // 创建自定义提示词用于不同的音频处理场景
    createPrompt(scenario: 'transcription' | 'summary' | 'notes' | 'action-items'): string {
        const prompts = {
            transcription: '请将这段音频准确转录为文本，保持原话的完整性。',
            summary: '请听这段音频并生成一份简洁的摘要，突出主要内容和关键点。',
            notes: '请将这段音频内容整理成结构化的笔记格式，包含标题、要点和详细说明。使用Markdown格式。',
            'action-items': '请从这段音频中提取所有的待办事项、决定和行动计划，并以清单形式列出。'
        };

        return prompts[scenario] || prompts.notes;
    }

    // 使用文本模型处理转录文本
    async processTextWithLLM(transcribedText: string, model: string = 'qwen-plus-latest'): Promise<TextProcessingResult> {
        try {
            console.log(`使用${model}模型处理文本，长度: ${transcribedText.length}字符`);

            // 分两次调用：文本整理 + 标签生成
            const [processedText, tags] = await Promise.all([
                this.improveText(transcribedText, model),
                this.generateTags(transcribedText, model)
            ]);

            return {
                processedText,
                tags
            };

        } catch (error) {
            console.error('LLM文本处理失败:', error);
            throw new Error(`文本处理失败: ${error.message}`);
        }
    }

    // 文本整理和优化
    private async improveText(text: string, model: string): Promise<string> {
        const request: CompatibleRequest = {
            model,
            messages: [
                {
                    role: 'system',
                    content: '你是一个专业的文本编辑助手。请对用户提供的语音转录文本进行整理和优化，要求：1. 修正语法错误和口语化表达 2. 保持原始内容的完整性和原意 3. 优化表达方式，使其更加清晰易读 4. 保持逻辑结构和重要信息不变 5. 使用规范的标点符号 6. 输出格式为规整的中文文本'
                },
                {
                    role: 'user',
                    content: `请对以下语音转录文本进行整理和优化：\n\n${text}`
                }
            ]
        };

        const response = await this.callCompatibleAPI(request);
        return response.choices[0]?.message?.content || text;
    }

    // 生成相关标签
    private async generateTags(text: string, model: string): Promise<string[]> {
        const request: CompatibleRequest = {
            model,
            messages: [
                {
                    role: 'system',
                    content: '你是一个专业的内容分析助手。请分析用户提供的文本内容，生成3-5个相关的标签。要求：1. 标签应该准确反映文本的主要内容和主题 2. 使用简洁的中文词汇 3. 避免过于宽泛或过于具体的标签 4. 标签之间用逗号分隔 5. 不需要添加#符号，只输出标签文字'
                },
                {
                    role: 'user',
                    content: `请为以下文本生成相关标签：\n\n${text}`
                }
            ]
        };

        const response = await this.callCompatibleAPI(request);
        const tagsText = response.choices[0]?.message?.content || '';
        
        // 解析标签，按逗号分割并清理
        return tagsText.split(/[,，、]/)
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0)
            .slice(0, 5); // 最多5个标签
    }

    // 调用兼容模式API
    private async callCompatibleAPI(request: CompatibleRequest): Promise<CompatibleResponse> {
        console.log('调用兼容模式API:', this.compatibleUrl);
        console.log('请求参数:', JSON.stringify(request, null, 2));

        const response = await requestUrl({
            url: this.compatibleUrl,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request),
            throw: false
        });

        console.log('兼容模式API响应状态:', response.status);

        if (response.status >= 400) {
            console.error('兼容模式API错误:', response.text);
            throw new Error(`兼容模式API请求失败 (${response.status}): ${response.text}`);
        }

        const data: CompatibleResponse = response.json;
        console.log('兼容模式API响应数据:', JSON.stringify(data, null, 2));

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('兼容模式API返回数据格式异常');
        }

        return data;
    }

    // 测试文本LLM连接
    async testTextLLM(model: string = 'qwen-plus-latest'): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`开始文本LLM测试，模型: ${model}`);

            const testRequest: CompatibleRequest = {
                model,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个有用的助手。'
                    },
                    {
                        role: 'user',
                        content: '请简单介绍一下你自己'
                    }
                ]
            };

            const response = await this.callCompatibleAPI(testRequest);
            
            if (response.choices?.[0]?.message?.content) {
                console.log('文本LLM测试成功，响应:', response.choices[0].message.content);
                return { success: true };
            } else {
                return { 
                    success: false, 
                    error: '响应格式异常' 
                };
            }

        } catch (error) {
            console.error('文本LLM测试失败:', error);
            
            let errorMessage = '未知错误';
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                errorMessage = '网络连接失败';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            return { 
                success: false, 
                error: errorMessage 
            };
        }
    }
}