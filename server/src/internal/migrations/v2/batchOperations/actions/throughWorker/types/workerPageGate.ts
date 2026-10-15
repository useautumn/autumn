export type WorkerPageGate = {
	signal: AbortSignal;
	recordOutcome: ({ unavailable }: { unavailable: boolean }) => void;
};
