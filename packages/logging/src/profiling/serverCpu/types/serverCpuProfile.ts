export type ServerCpuPhase =
	| "auth"
	| "routing"
	| "balanceWorkerClient"
	| "serialization"
	| "logging"
	| "unattributed";

export type ServerCpuFrame = { name?: string; sourceURL?: string };
export type ServerCpuSamples = {
	interval: number;
	traces: { frames: ServerCpuFrame[] }[];
};

export type ServerCpuBackend = {
	readThreadCpuNs: () => number;
	readProcessCpuUs: () => number;
	now: () => number;
	capture: (
		run: () => Promise<void>,
	) => Promise<{ stackTraces: ServerCpuSamples }>;
};

export type ServerCpuWindow = {
	estimator: "jsc-sample-share-times-main-thread-cpu";
	profiledWindowMs: number;
	profiledProcessCpuMs: number;
	mainThreadCpuMs: number;
	otherThreadCpuMs: number;
	gcCpuMs: null;
	sampleIntervalUs: number;
	samples: number;
	phases: Record<
		ServerCpuPhase,
		{ samples: number; estimatedCpuMs: number | null }
	>;
};

export type ServerCpuSampler = {
	enabled: boolean;
	startWindow: () => void;
	finishWindow: () => Promise<ServerCpuWindow | null>;
};
