import type { AtomEnv } from "@autumn/env/atom";

/** Two ports between a pair of threads: the calls this thread makes to the other, and the other's calls to it. */
export type PeerPorts = { calls: MessagePort; answers: MessagePort };

/** What a thread is told as it starts. Every other thread reaches it later as a `peerJoined`. */
export type ThreadInit = {
	type: "init";
	index: number;
	env: AtomEnv;
	bootedAt: string;
	/** One Int32: how many threads the main thread has replaced, shared so any thread's /health reads it. */
	restarts: SharedArrayBuffer;
};

/** What the main thread tells a running thread. */
export type ThreadControl =
	| ThreadInit
	| { type: "peerJoined"; index: number; ports: PeerPorts }
	| { type: "peerLeft"; index: number }
	| { type: "stop" };

/** What a thread tells the main thread. */
export type ThreadStatus = { type: "ready" } | { type: "stopped" };
