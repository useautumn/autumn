import type { AtomEnv } from "@autumn/env/atom";

export type PeerPorts = { calls: MessagePort; answers: MessagePort };

export type PeerLine = { index: number; ports: PeerPorts };

export type ThreadInit = {
	type: "init";
	index: number;
	env: AtomEnv;
	bootedAt: string;
	restarts: SharedArrayBuffer;
	ready: SharedArrayBuffer;
	threadsReady: SharedArrayBuffer;
	stats: SharedArrayBuffer;
	sqliteOpenLock: SharedArrayBuffer;
	peers: PeerLine[];
};

export type ThreadControl =
	| ThreadInit
	| ({ type: "peerJoined" } & PeerLine)
	| { type: "peerLeft"; index: number }
	| { type: "stop" };

export type ThreadStatus = { type: "ready" } | { type: "stopped" };
