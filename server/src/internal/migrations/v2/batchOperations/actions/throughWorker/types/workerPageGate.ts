export type WorkerPageGate = {
	signal: AbortSignal;
	assertActive: () => void;
	recordOutcome: ({ unavailable }: { unavailable: boolean }) => void;
};
