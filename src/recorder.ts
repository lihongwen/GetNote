export class AudioRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private isRecording = false;
    private isPaused = false;
    private startTime: number = 0;
    private pausedDuration: number = 0;
    private pauseStartTime: number = 0;
    
    // iOS特定状态管理
    private isIOS: boolean = false;
    private permissionLastGranted: number = 0;
    private permissionExpiryMs: number = 60 * 1000; // iOS权限60秒过期
    private audioContext: AudioContext | null = null;

    // Wake Lock状态管理
    private wakeLock: WakeLockSentinel | null = null;
    private wakeLockEnabled: boolean = true; // 默认启用防锁屏
    private onWakeLockChange?: (isActive: boolean, error?: string) => void;

    constructor(
        private onDataAvailable: (blob: Blob) => void,
        private onError: (error: Error) => void,
        options?: {
            enableWakeLock?: boolean;
            onWakeLockChange?: (isActive: boolean, error?: string) => void;
        }
    ) {
        // 检测是否为iOS设备
        this.isIOS = this.detectIOS();
        
        // 配置Wake Lock
        if (options?.enableWakeLock !== undefined) {
            this.wakeLockEnabled = options.enableWakeLock;
        }
        if (options?.onWakeLockChange) {
            this.onWakeLockChange = options.onWakeLockChange;
        }
        
        // 初始化页面可见性监听
        this.initVisibilityListener();
    }

    async startRecording(): Promise<void> {
        if (this.isRecording) {
            throw new Error('已在录音中');
        }

        try {
            // iOS特定权限检查
            if (this.isIOS) {
                await this.ensureIOSPermission();
            }

            // 请求麦克风权限
            const audioConstraints = this.getAudioConstraints();
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

            // iOS特定AudioContext初始化
            if (this.isIOS && !this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                // iOS需要在用户手势中启动AudioContext
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
            }

            // 创建MediaRecorder
            const mimeType = this.getSupportedMimeType();
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: mimeType
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
                    type: mimeType 
                });
                this.onDataAvailable(audioBlob);
                this.cleanup();
            };

            this.mediaRecorder.onerror = (event) => {
                const errorMsg = this.getErrorMessage(event);
                this.onError(new Error(errorMsg));
                this.cleanup();
            };

            // 开始录音
            this.mediaRecorder.start(this.isIOS ? 100 : 1000); // iOS使用更频繁的数据收集
            this.isRecording = true;
            this.isPaused = false;
            this.startTime = Date.now();
            this.pausedDuration = 0;
            
            // 记录权限获取时间
            if (this.isIOS) {
                this.permissionLastGranted = Date.now();
            }
            
            // 激活Wake Lock防锁屏（如果启用）
            if (this.wakeLockEnabled) {
                await this.requestWakeLock();
            }

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
            
            // 释放Wake Lock
            this.releaseWakeLock();
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
        
        // iOS特定清理
        if (this.isIOS && this.audioContext) {
            try {
                this.audioContext.suspend();
            } catch (error) {
                console.warn('AudioContext suspend failed:', error);
            }
            // 不设置为null，保留AudioContext以便重用
        }
        
        // 清理Wake Lock
        this.releaseWakeLock();
        
        // 清理页面可见性监听
        this.cleanupVisibilityListener();
        
        this.mediaRecorder = null;
        this.isRecording = false;
        this.isPaused = false;
        this.audioChunks = [];
        this.startTime = 0;
        this.pausedDuration = 0;
        this.pauseStartTime = 0;
    }

    private getSupportedMimeType(): string {
        // iOS Safari优先使用MP4格式
        const types = this.isIOS 
            ? [
                'audio/mp4',
                'audio/mp4;codecs=mp4a.40.2',
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/wav'
            ]
            : [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/ogg',
                'audio/mp4',
                'audio/wav',
                'audio/mpeg'
            ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        // iOS默认使用MP4，其他平台使用webm
        const defaultType = this.isIOS ? 'audio/mp4' : 'audio/webm';
        return defaultType;
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
        const isIOS = AudioRecorder.detectIOSStatic();
        
        try {
            // iOS Safari不完全支持permissions API，直接尝试获取媒体流
            if (isIOS) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                    stream.getTracks().forEach(track => track.stop());
                    return true;
                } catch (error) {
                    console.log('iOS麦克风权限检查失败:', error);
                    return false;
                }
            }
            
            // 非iOS设备使用permissions API
            const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            return result.state === 'granted';
        } catch (error) {
            // 权限API不支持，尝试直接获取媒体流
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * 检测是否为iOS设备
     */
    private detectIOS(): boolean {
        return AudioRecorder.detectIOSStatic();
    }

    /**
     * 静态方法：检测是否为iOS设备
     */
    static detectIOSStatic(): boolean {
        if (typeof navigator === 'undefined') return false;
        
        const userAgent = navigator.userAgent.toLowerCase();
        const platform = navigator.platform?.toLowerCase() || '';
        
        // 检测iPhone、iPad、iPod
        return /iphone|ipad|ipod/.test(userAgent) || 
               /iphone|ipad|ipod/.test(platform) ||
               // 检测iOS 13+ Safari桌面模式
               (platform === 'mactel' && navigator.maxTouchPoints > 1);
    }

    /**
     * iOS特定权限确保机制
     */
    private async ensureIOSPermission(): Promise<void> {
        const now = Date.now();
        
        // 检查权限是否可能已过期
        if (this.permissionLastGranted > 0 && 
            (now - this.permissionLastGranted) > this.permissionExpiryMs) {
            console.log('iOS权限可能已过期，需要重新申请');
            this.permissionLastGranted = 0;
        }

        // 如果需要重新申请权限，先尝试一次
        if (this.permissionLastGranted === 0) {
            try {
                const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                testStream.getTracks().forEach(track => track.stop());
                this.permissionLastGranted = now;
                console.log('iOS权限申请成功');
            } catch (error) {
                throw new Error(`麦克风权限被拒绝或不可用。请在Safari设置中允许此网站访问麦克风，然后重试。错误详情: ${error.message}`);
            }
        }
    }

    /**
     * 获取适合iOS的音频约束
     */
    private getAudioConstraints(): MediaTrackConstraints {
        if (this.isIOS) {
            return {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                // iOS特定设置
                sampleRate: { ideal: 44100, min: 22050 },
                sampleSize: { ideal: 16 },
                channelCount: { ideal: 1 } // 单声道以减少处理负担
            };
        } else {
            return {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
            };
        }
    }

    /**
     * 获取详细的错误信息
     */
    private getErrorMessage(event: MediaRecorderErrorEvent): string {
        const error = event.error;
        
        if (this.isIOS) {
            if (error.name === 'NotAllowedError') {
                return `麦克风权限被拒绝。请在Safari设置中允许此网站访问麦克风，然后刷新页面重试。`;
            } else if (error.name === 'NotFoundError') {
                return `未找到麦克风设备。请检查设备是否正确连接。`;
            } else if (error.name === 'NotSupportedError') {
                return `当前iOS版本不支持录音功能。请更新到最新版本的Safari。`;
            } else if (error.name === 'SecurityError') {
                return `安全限制阻止录音。请确保在HTTPS环境下使用此功能。`;
            }
        }
        
        return `录音错误: ${error.name} - ${error.message}`;
    }

    /**
     * 检查iOS权限是否仍然有效
     */
    private isIOSPermissionValid(): boolean {
        if (!this.isIOS || this.permissionLastGranted === 0) {
            return false;
        }
        
        const now = Date.now();
        return (now - this.permissionLastGranted) < this.permissionExpiryMs;
    }

    /**
     * iOS特定的权限状态检查
     */
    static async checkIOSMicrophoneStatus(): Promise<{
        supported: boolean;
        hasPermission: boolean;
        error?: string;
    }> {
        const isIOS = AudioRecorder.detectIOSStatic();
        
        if (!isIOS) {
            return { supported: false, hasPermission: false, error: '非iOS设备' };
        }

        try {
            // 检查基本支持
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return { supported: false, hasPermission: false, error: '浏览器不支持录音' };
            }

            if (!window.MediaRecorder) {
                return { supported: false, hasPermission: false, error: '浏览器不支持MediaRecorder' };
            }

            // 尝试权限检查
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            
            return { supported: true, hasPermission: true };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '未知错误';
            return { supported: true, hasPermission: false, error: errorMsg };
        }
    }

    // ================================
    // Wake Lock API方法
    // ================================

    /**
     * 请求Wake Lock防锁屏
     */
    private async requestWakeLock(): Promise<void> {
        // 检查Wake Lock API支持
        if (!this.isWakeLockSupported()) {
            console.log('设备不支持Wake Lock API，跳过防锁屏设置');
            this.notifyWakeLockChange(false, '设备不支持Wake Lock API');
            return;
        }

        try {
            // 释放之前的Wake Lock（如果存在）
            if (this.wakeLock) {
                await this.wakeLock.release();
            }

            // 请求新的Wake Lock
            this.wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock已激活，屏幕将保持亮起');
            
            // 设置释放监听器
            this.wakeLock.addEventListener('release', () => {
                console.log('Wake Lock已释放');
                this.wakeLock = null;
                this.notifyWakeLockChange(false);
            });

            this.notifyWakeLockChange(true);

        } catch (error) {
            console.error('请求Wake Lock失败:', error);
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            this.notifyWakeLockChange(false, errorMessage);
            
            // 不抛出错误，因为Wake Lock失败不应该阻止录音
        }
    }

    /**
     * 释放Wake Lock
     */
    private releaseWakeLock(): void {
        if (this.wakeLock) {
            this.wakeLock.release().then(() => {
                console.log('Wake Lock已主动释放');
                this.wakeLock = null;
                this.notifyWakeLockChange(false);
            }).catch((error: Error | DOMException) => {
                console.error('释放Wake Lock时出错:', error);
                this.wakeLock = null;
                this.notifyWakeLockChange(false, error?.message || '未知错误');
            });
        }
    }

    /**
     * 检查Wake Lock API是否支持
     */
    private isWakeLockSupported(): boolean {
        return 'wakeLock' in navigator && 'request' in navigator.wakeLock;
    }

    /**
     * 检查Wake Lock是否激活
     */
    isWakeLockActive(): boolean {
        return this.wakeLock !== null && !this.wakeLock.released;
    }

    /**
     * 获取Wake Lock状态
     */
    getWakeLockState(): {
        isSupported: boolean;
        isActive: boolean;
        isEnabled: boolean;
    } {
        return {
            isSupported: this.isWakeLockSupported(),
            isActive: this.isWakeLockActive(),
            isEnabled: this.wakeLockEnabled
        };
    }

    /**
     * 设置Wake Lock启用状态
     */
    setWakeLockEnabled(enabled: boolean): void {
        this.wakeLockEnabled = enabled;
        
        // 如果正在录音且启用了Wake Lock，立即请求
        if (enabled && this.isRecording && !this.isWakeLockActive()) {
            this.requestWakeLock();
        }
        // 如果禁用了Wake Lock且当前激活，立即释放
        else if (!enabled && this.isWakeLockActive()) {
            this.releaseWakeLock();
        }
    }

    /**
     * 通知Wake Lock状态变化
     */
    private notifyWakeLockChange(isActive: boolean, error?: string): void {
        if (this.onWakeLockChange) {
            this.onWakeLockChange(isActive, error);
        }
    }

    /**
     * 静态方法：检查设备对Wake Lock的支持状态
     */
    static checkWakeLockSupport(): {
        isSupported: boolean;
        userAgent: string;
        isSafari: boolean;
        isIOS: boolean;
        isHTTPS: boolean;
        message: string;
    } {
        const isSupported = 'wakeLock' in navigator && 'request' in (navigator.wakeLock || {});
        const userAgent = navigator.userAgent;
        const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
        const isIOS = AudioRecorder.detectIOSStatic();
        const isHTTPS = location.protocol === 'https:';

        let message = '';
        if (!isSupported) {
            if (isIOS && !isSafari) {
                message = 'iOS设备建议使用Safari浏览器以获得最佳录音体验';
            } else if (isIOS && !isHTTPS) {
                message = '需要HTTPS环境才能使用防锁屏功能';
            } else if (isIOS) {
                message = '当前iOS版本可能不支持Wake Lock，建议更新到最新版本';
            } else {
                message = '当前浏览器不支持Wake Lock API';
            }
        } else {
            message = 'Wake Lock API支持正常，可以防止录音时锁屏';
        }

        return {
            isSupported,
            userAgent,
            isSafari,
            isIOS,
            isHTTPS,
            message
        };
    }

    /**
     * 处理页面可见性变化（重要：页面隐藏后显示需要重新请求Wake Lock）
     */
    private handleVisibilityChange = async (): Promise<void> => {
        if (document.visibilityState === 'visible' && 
            this.isRecording && 
            this.wakeLockEnabled && 
            !this.isWakeLockActive()) {
            
            console.log('页面重新可见，重新请求Wake Lock');
            await this.requestWakeLock();
        }
    };

    /**
     * 初始化页面可见性监听（应在构造函数中调用）
     */
    private initVisibilityListener(): void {
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    /**
     * 清理页面可见性监听
     */
    private cleanupVisibilityListener(): void {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
}