import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Pool } from "pg";
import {
	checkSlowReads,
	parseTcpQueues,
	SLOW_READ_THRESHOLD_MS,
	watchSlowReads,
} from "@/db/slowReadProbe.js";
import { logger } from "@/external/logtail/logtailUtils.js";

const PROC_NET_TCP = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 1 1 0000000000000000 100 0 0 10 0
   1: 0A000005:D431 0A00000A:1920 01 00000010:0003A000 00:00000000 00000000  1000        0 2 1 0000000000000000 20 4 30 10 -1`;

describe("parseTcpQueues", () => {
	test("reads tx and rx queue bytes for the socket's local port", () => {
		expect(
			parseTcpQueues({ procNetTcp: PROC_NET_TCP, localPort: 0xd431 }),
		).toEqual({
			txQueue: 0x10,
			rxQueue: 0x3a000,
		});
	});

	test("returns null when no socket has that local port", () => {
		expect(
			parseTcpQueues({ procNetTcp: PROC_NET_TCP, localPort: 5432 }),
		).toBeNull();
	});
});

describe("checkSlowReads", () => {
	const warn = spyOn(logger, "warn").mockImplementation(() => logger);
	const checkedOut: { pool: EventEmitter; client: object }[] = [];
	afterEach(() => {
		for (const { pool, client } of checkedOut.splice(0)) {
			pool.emit("release", undefined, client);
		}
		warn.mockClear();
	});

	const setup = () => {
		const pool = new EventEmitter();
		watchSlowReads({
			pool: pool as unknown as Pool,
			name: `test-${Math.random()}`,
		});
		const socket = { bytesRead: 1_000, localPort: 54321, remotePort: 6432 };
		const client = {
			activeQuery: {} as object | null,
			connection: { stream: socket },
		};
		pool.emit("acquire", client);
		checkedOut.push({ pool, client });
		return { pool, socket, client };
	};

	const slowReadLines = () =>
		warn.mock.calls
			.filter(([message]) => message === "db_slow_read")
			.map(([, fields]) => fields as Record<string, unknown>);

	test("logs nothing for reads under the threshold", () => {
		const { socket } = setup();
		checkSlowReads({ now: 0 });
		socket.bytesRead += 500;
		checkSlowReads({ now: SLOW_READ_THRESHOLD_MS - 1 });
		expect(slowReadLines()).toHaveLength(0);
	});

	test("logs byte progress every check once a read passes the threshold, then a done line", () => {
		const { pool, socket, client } = setup();
		checkSlowReads({ now: 0 });
		socket.bytesRead += 160_000;
		checkSlowReads({ now: SLOW_READ_THRESHOLD_MS });
		socket.bytesRead += 80_000;
		checkSlowReads({ now: SLOW_READ_THRESHOLD_MS + 5_000 });
		pool.emit("release", undefined, client);
		checkedOut.length = 0;

		const lines = slowReadLines();
		expect(
			lines.map((line) => [
				line.done,
				line.bytesSinceLastCheck,
				line.bytesSinceFirstSeen,
			]),
		).toEqual([
			[false, 160_000, 160_000],
			[false, 80_000, 240_000],
			[true, 0, 240_000],
		]);
		expect(lines[0]).toMatchObject({ localPort: 54321, remotePort: 6432 });
	});

	test("starts a new read when the client runs a different query", () => {
		const { socket, client } = setup();
		checkSlowReads({ now: 0 });
		client.activeQuery = {};
		socket.bytesRead += 10;
		checkSlowReads({ now: SLOW_READ_THRESHOLD_MS });
		expect(slowReadLines()).toHaveLength(0);
	});
});
