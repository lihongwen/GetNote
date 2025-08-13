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

export class DashScopeClient {
    private readonly apiKey: string;
    private readonly baseUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async processAudio(audioBlob: Blob, prompt: string = '请将这段音频转录为文本，并整理成结构化的笔记格式'): Promise<string> {
        try {
            // 检测音频类型并转换为base64
            const audioType = this.detectAudioType(audioBlob);
            const audioBase64 = await this.blobToBase64(audioBlob);
            
            console.log(`处理音频: 类型=${audioType}, 大小=${audioBlob.size}字节`);
            
            const request: DashScopeRequest = {
                model: 'qwen-audio-turbo-latest',
                input: {
                    messages: [
                        {
                            role: 'system',
                            content: [
                                {
                                    text: "You are a helpful assistant."
                                }
                            ]
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    audio: `data:${audioType};base64,${audioBase64}`
                                },
                                {
                                    text: prompt
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
            
            // 使用官方文档中的测试音频URL进行测试
            const testRequest: DashScopeRequest = {
                model: 'qwen-audio-turbo-latest',
                input: {
                    messages: [
                        {
                            role: 'system',
                            content: [
                                {
                                    text: "You are a helpful assistant."
                                }
                            ]
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    audio: "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3"
                                },
                                {
                                    text: "这段音频在说什么?"
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
}