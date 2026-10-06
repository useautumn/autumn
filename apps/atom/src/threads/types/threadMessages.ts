import type { AtomEnv } from "@autumn/env/atom";

/** What a thread is told as it starts. */
export type ThreadInit = {
	type: "init";
	index: number;
	env: AtomEnv;
	bootedAt: string;
	/** One Int32: how many threads the main thread has replaced, shared so any thread's /health reads it. */
	restarts: SharedArrayBuffer;
};

/** What the main thread tells a running thread. */
export type ThreadControl = ThreadInit | { type: "stop" };

/** What a thread tells the main thread. */
export type ThreadStatus = { type: "ready" } | { type: "stopped" };
