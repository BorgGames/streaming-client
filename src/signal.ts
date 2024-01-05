export interface ISignal {
	sendCandidate(candidateJSON: string): void;
    cfgDefaults(cfg: any): any;
    connect(cfg: any, sessionId: string,
            answer: RTCLocalSessionDescriptionInit,
            onCandidate: any): Promise<void>;
    getAttemptId(): string;
    close(code: number): void;
}
