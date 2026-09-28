import { expect, test } from "bun:test";
import { TinybirdError } from "@autumn/tinybird";
import { landRecords } from "../../../src/stream/landRecords/landRecords.js";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../../src/stream/types/streamConsumer.js";

/** Positions are all a landing decision reads; the record body never matters here. */
const recordAt = (offset: number): StreamRecord =>
	({
		position: { topic: "local-events", partition: 0, offset: BigInt(offset) },
		record: {} as StreamRecord["record"],
	}) as StreamRecord;

const createLogger = () => {
	const logs: { level: string; type: string; offset?: string }[] = [];
	const log =
		(level: string) =>
		(...args: unknown[]) => {
			const payload = args[0] as { type?: string; data?: { offset?: string } };
			logs.push({
				level,
				type: payload.type ?? "",
				offset: payload.data?.offset,
			});
		};
	return {
		logs,
		logger: { info: log("info"), warn: log("warn"), error: log("error") },
	};
};

const createContext = ({ signal }: { signal?: AbortSignal } = {}) => {
	const { logs, logger } = createLogger();
	const delays: number[] = [];
	const heartbeats = { count: 0 };
	return {
		logs,
		delays,
		heartbeats,
		ctx: {
			logger,
			signal: signal ?? new AbortController().signal,
			heartbeat: async () => {
				heartbeats.count += 1;
			},
			sleep: async ({ delayMs }: { delayMs: number }) => {
				delays.push(delayMs);
			},
		},
	};
};

/** A job that fails the whole batch while `failures` are left, then lands it. */
const createStoreJob = ({
	failures,
	cause,
}: {
	failures: number;
	cause: Error;
}) => {
	const batches: number[][] = [];
	let remaining = failures;
	const job: StreamConsumer = {
		name: "usage-events",
		handle: async ({ records }) => {
			batches.push(records.map(({ position }) => Number(position.offset)));
			if (remaining > 0) {
				remaining -= 1;
				throw cause;
			}
		},
	};
	return { job, batches };
};

test("a store failure is retried in place with capped backoff until the store answers, and reported while it waits", async () => {
	const { ctx, logs, delays, heartbeats } = createContext();
	const { job, batches } = createStoreJob({
		failures: 6,
		cause: Object.assign(new Error("connection reset"), { errno: "08006" }),
	});

	const settled = await landRecords({
		ctx,
		job,
		records: [recordAt(1), recordAt(2)],
	});

	expect(settled).toBe(true);
	expect(batches).toHaveLength(7);
	expect(batches.every((batch) => batch.length === 2)).toBe(true);
	expect(delays).toEqual([200, 800, 3200, 5000, 5000, 5000]);
	// Every wait heartbeats, so an outage longer than the session timeout keeps the partition.
	expect(heartbeats.count).toBe(6);
	expect(logs.map(({ level, type }) => `${level}:${type}`)).toEqual([
		"warn:herald_store_waiting",
		"info:herald_store_recovered",
	]);
});

test("a Tinybird reply is the store's failure too", async () => {
	const { ctx, delays } = createContext();
	const { job, batches } = createStoreJob({
		failures: 1,
		cause: new TinybirdError("service unavailable", 503),
	});

	await landRecords({ ctx, job, records: [recordAt(1)] });

	expect(batches).toHaveLength(2);
	expect(delays).toEqual([200]);
});

test("a record the job cannot handle is narrowed down and skipped; every other record lands", async () => {
	const { ctx, logs } = createContext();
	const handled: number[] = [];
	const job: StreamConsumer = {
		name: "balance-webhooks",
		handle: async ({ records }) => {
			if (records.some(({ position }) => position.offset === 3n))
				throw new TypeError("cannot read env of undefined");
			handled.push(...records.map(({ position }) => Number(position.offset)));
		},
	};

	const settled = await landRecords({
		ctx,
		job,
		records: [1, 2, 3, 4, 5].map(recordAt),
	});

	expect(settled).toBe(true);
	expect(handled.sort((a, b) => a - b)).toEqual([1, 2, 4, 5]);
	expect(logs).toEqual([
		{ level: "error", type: "herald_record_skipped", offset: "3" },
	]);
});

test("stopping herald ends a wait on the store without skipping anything, and leaves the batch unsettled", async () => {
	const stopping = new AbortController();
	const { ctx, logs } = createContext({ signal: stopping.signal });
	let attempts = 0;
	const job: StreamConsumer = {
		name: "usage-events",
		handle: async () => {
			attempts += 1;
			stopping.abort();
			throw Object.assign(new Error("connection reset"), { errno: "08006" });
		},
	};

	const settled = await landRecords({ ctx, job, records: [recordAt(1)] });

	expect(settled).toBe(false);
	expect(attempts).toBe(1);
	expect(logs).toEqual([]);
});

test("stopping herald between split halves leaves the batch unsettled", async () => {
	const stopping = new AbortController();
	const { ctx } = createContext({ signal: stopping.signal });
	const handled: number[] = [];
	const job: StreamConsumer = {
		name: "balance-webhooks",
		handle: async ({ records }) => {
			if (records.length > 1)
				throw new TypeError("cannot read env of undefined");
			handled.push(Number(records[0]?.position.offset));
			stopping.abort();
		},
	};

	const settled = await landRecords({
		ctx,
		job,
		records: [recordAt(1), recordAt(2)],
	});

	expect(settled).toBe(false);
	expect(handled).toEqual([1]);
});
