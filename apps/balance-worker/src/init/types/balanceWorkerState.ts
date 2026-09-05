import type {
	WorkerLifecycleContext,
	WorkerListener,
} from "./balanceWorker.js";

export type BalanceWorkerState = {
	status: "created" | "starting" | "running" | "stopping" | "stopped";
	listener?: WorkerListener;
	startup?: Promise<void>;
	stopping?: Promise<void>;
};

export type WorkerLifecycleScope = {
	ctx: WorkerLifecycleContext;
	state: BalanceWorkerState;
};
