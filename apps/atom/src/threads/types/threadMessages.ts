import type { AtomEnv } from "@autumn/env/atom";

/** Two ports between a pair of threads: the calls this thread makes to the other, and the other's calls to it. */
export type PeerPorts = { calls: MessagePort; answers: MessagePort };

/** A line to another thread, as each side holds it. */
export type PeerLine = { index: number; ports: PeerPorts };

/** What a thread is told as it starts, with a line to every thread already running, joined before it listens. */
export type ThreadInit = {
	type: "init";
	index: number;
	env: AtomEnv;
	bootedAt: string;
	/** One Int32: how many threads the main thread has replaced, shared so any thread's /health reads it. */
	restarts: SharedArrayBuffer;
	/** One Int32 the main thread sets once every thread has started; any thread's /health reads it. */
	ready: SharedArrayBuffer;
	/** One Int32 per thread: each sets its own once it has caught up, and the main thread clears it when the thread dies. */
	threadsReady: SharedArrayBuffer;
	/** Every thread's counters (see threadStats), shared the same way. */
	stats: SharedArrayBuffer;
	/** Which listed peers count as ring members (createMembership), shared so every thread's ring flips at once. */
	membership: SharedArrayBuffer;
	/** The lock every SQLite connection in the process is opened under (newSqliteConnection). */
	sqliteOpenLock: SharedArrayBuffer;
	peers: PeerLine[];
};

/** What the main thread tells a running thread. */
export type ThreadControl =
	| ThreadInit
	| ({ type: "peerJoined" } & PeerLine)
	| { type: "peerLeft"; index: number }
	| { type: "stop" };

/** What a thread tells the main thread. */
export type ThreadStatus = { type: "ready" } | { type: "stopped" };
