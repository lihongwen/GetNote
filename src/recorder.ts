export class AudioRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private isRecording = false;
    private isPaused = false;
    private startTime: number = 0;
    private pausedDuration: number = 0;
    private pauseStartTime: number = 0;

    constructor(
        private onDataAvailable: (blob: Blob) => void,
        private onError: (error: Error) => void
    ) {}

    async startRecording(): Promise<void> {
        if (this.isRecording) {
            throw new Error('已在录音中');
        }

        try {
            // 请求麦克风权限
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }
            });

            // 创建MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: this.getSupportedMimeType()
            });

            this.audioChunks = [];

            // 设置事件监听器
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { 
                    type: this.getSupportedMimeType() 
                });
                this.onDataAvailable(audioBlob);
                this.cleanup();
            };

            this.mediaRecorder.onerror = (event) => {
                this.onError(new Error(`录音错误: ${event.error}`));
                this.cleanup();
            };

            // 开始录音
            this.mediaRecorder.start(1000); // 每1秒收集一次数据
            this.isRecording = true;
            this.isPaused = false;
            this.startTime = Date.now();
            this.pausedDuration = 0;

        } catch (error) {
            this.onError(new Error(`无法启动录音: ${error.message}`));
            this.cleanup();
            throw error;
        }
    }

    stopRecording(): void {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.isPaused = false;
        }
    }

    pauseRecording(): void {
        if (this.mediaRecorder && this.isRecording && !this.isPaused) {
            this.mediaRecorder.pause();
            this.isPaused = true;
            this.pauseStartTime = Date.now();
        }
    }

    resumeRecording(): void {
        if (this.mediaRecorder && this.isRecording && this.isPaused) {
            this.mediaRecorder.resume();
            this.isPaused = false;
            this.pausedDuration += Date.now() - this.pauseStartTime;
        }
    }

    getRecordingState(): boolean {
        return this.isRecording;
    }

    getPausedState(): boolean {
        return this.isPaused;
    }

    private cleanup(): void {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.mediaRecorder = null;
        this.isRecording = false;
        this.isPaused = false;
        this.audioChunks = [];
        this.startTime = 0;
        this.pausedDuration = 0;
        this.pauseStartTime = 0;
    }

    private getSupportedMimeType(): string {
        // 优先选择支持的音频格式
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/wav',
            'audio/mp4',
            'audio/mpeg'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return 'audio/webm'; // 默认格式
    }

    // 获取录音时长（毫秒）
    getRecordingDuration(): number {
        if (!this.isRecording) {
            return 0;
        }
        
        const currentTime = Date.now();
        let totalDuration = currentTime - this.startTime - this.pausedDuration;
        
        // 如果当前正在暂停，还需要减去当前暂停的时间
        if (this.isPaused) {
            totalDuration -= (currentTime - this.pauseStartTime);
        }
        
        return Math.max(0, totalDuration);
    }

    // 检查浏览器是否支持录音
    static isSupported(): boolean {
        return !!(navigator.mediaDevices && 
                 navigator.mediaDevices.getUserMedia && 
                 window.MediaRecorder);
    }

    // 检查麦克风权限
    static async checkMicrophonePermission(): Promise<boolean> {
        try {
            const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            return result.state === 'granted';
        } catch (error) {
            // 如果permissions API不支持，尝试直接获取媒体流
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                return true;
            } catch {
                return false;
            }
        }
    }
}