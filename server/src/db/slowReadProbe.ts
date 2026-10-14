import { readFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";

export const SLOW_READ_THRESHOLD_MS = 10_000;
export const SLOW_READ_CHECK_INTERVAL_MS = 5_000;

type TcpQueues = { txQueue: number; rxQueue: number };

type ReadSocket = {
	bytesRead: number;
	localPort?: number;
	remotePort?: number;
};

/** node-postgres internals, read-only: the in-flight query and its socket. */
type ObservedClient = PoolClient & {
	activeQuery?: object | null;
	connection?: { stream?: ReadSocket };
};

type SlowRead = {
	query: object;
	firstSeenAt: number;
	bytesAtFirstSeen: number;
	bytesAtLastCheck: number;
	logged: boolean;
};

type WatchedPool = { name: string; inUse: Set<ObservedClient> };

const watchedPools: WatchedPool[] = [];
const readsByClient = new WeakMap<ObservedClient, SlowRead>();
let checkInterval: ReturnType<typeof setInterval> | null = null;

export const parseTcpQueues = ({
	procNetTcp,
	localPort,
}: {
	procNetTcp: string;
	localPort: number;
}): TcpQueues | null => {
	const portHex = localPort.toString(16).toUpperCase().padStart(4, "0");
	for (const line of procNetTcp.split("\n")) {
		const fields = line.trim().split(/\s+/);
		const [, localAddress, , , queues] = fields;
		if (!localAddress?.endsWith(`:${portHex}`) || !queues) continue;
		const [tx, rx] = queues.split(":");
		return {
			txQueue: Number.parseInt(tx ?? "0", 16),
			rxQueue: Number.parseInt(rx ?? "0", 16),
		};
	}
	return null;
};

const readTcpQueues = (localPort?: number): TcpQueues | null => {
	if (!localPort) return null;
	for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
		let procNetTcp: string;
		try {
			procNetTcp = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		const queues = parseTcpQueues({ procNetTcp, localPort });
		if (queues) return queues;
	}
	return null;
};

const logSlowRead = ({
	pool,
	socket,
	read,
	now,
	done,
}: {
	pool: string;
	socket?: ReadSocket;
	read: SlowRead;
	now: number;
	done: boolean;
}): void => {
	const bytesRead = socket?.bytesRead ?? read.bytesAtLastCheck;
	logger.warn("db_slow_read", {
		type: "db_slow_read",
		pool,
		pid: process.pid,
		done,
		localPort: socket?.localPort,
		remotePort: socket?.remotePort,
		ageMs: now - read.firstSeenAt,
		bytesSinceFirstSeen: bytesRead - read.bytesAtFirstSeen,
		bytesSinceLastCheck: bytesRead - read.bytesAtLastCheck,
		...(done ? {} : readTcpQueues(socket?.localPort)),
	});
	read.bytesAtLastCheck = bytesRead;
	read.logged = true;
};

const finishSlowRead = ({
	pool,
	client,
	now,
}: {
	pool: string;
	client: ObservedClient;
	now: number;
}): void => {
	const read = readsByClient.get(client);
	readsByClient.delete(client);
	if (!read?.logged) return;
	logSlowRead({
		pool,
		socket: client.connection?.stream,
		read,
		now,
		done: true,
	});
};

export const checkSlowReads = ({ now = performance.now() } = {}): void => {
	for (const { name, inUse } of watchedPools) {
		for (const client of inUse) {
			const query = client.activeQuery;
			const socket = client.connection?.stream;
			const read = readsByClient.get(client);

			if (read && read.query !== query)
				finishSlowRead({ pool: name, client, now });
			if (!query || !socket) continue;

			const current = readsByClient.get(client);
			if (!current) {
				readsByClient.set(client, {
					query,
					firstSeenAt: now,
					bytesAtFirstSeen: socket.bytesRead,
					bytesAtLastCheck: socket.bytesRead,
					logged: false,
				});
				continue;
			}
			if (now - current.firstSeenAt < SLOW_READ_THRESHOLD_MS) continue;
			logSlowRead({ pool: name, socket, read: current, now, done: false });
		}
	}
};

export const watchSlowReads = ({
	pool,
	name,
}: {
	pool: Pool;
	name: string;
}): void => {
	const inUse = new Set<ObservedClient>();
	watchedPools.push({ name, inUse });
	pool.on("acquire", (client) => inUse.add(client as ObservedClient));
	pool.on("release", (_err, client) => {
		inUse.delete(client as ObservedClient);
		finishSlowRead({
			pool: name,
			client: client as ObservedClient,
			now: performance.now(),
		});
	});
};

export const startSlowReadProbe = (): void => {
	if (checkInterval) return;
	checkInterval = setInterval(checkSlowReads, SLOW_READ_CHECK_INTERVAL_MS);
};

export const stopSlowReadProbe = (): void => {
	if (!checkInterval) return;
	clearInterval(checkInterval);
	checkInterval = null;
};
