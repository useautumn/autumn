export const isTwWorkerMode = (): boolean =>
	process.env.TW_WORKER_MODE === "1" && process.env.NODE_ENV !== "production";
