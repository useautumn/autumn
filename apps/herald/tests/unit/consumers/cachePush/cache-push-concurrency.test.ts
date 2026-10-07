import { expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { StreamRecord } from "../../../../src/stream/types/streamConsumer.js";

let inFlight = 0;
let peak = 0;
let release: (() => void) | null = null;
let gate: Promise<void> = Promise.resolve();
const pushed: string[] = [];
mock.module(
	"../../../../src/consumers/cachePush/pushSubjectToCache/pushSubjectToCache.js",
	() => ({
		pushSubjectToCache: async ({
			cacheSubject,
		}: {
			cacheSubject: { identity: { customerId: string }; logOffset: bigint };
		}) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await gate;
			await Bun.sleep(1);
			pushed.push(
				`${cacheSubject.identity.customerId}@${cacheSubject.logOffset}`,
			);
			inFlight--;
			return { targetsMs: 1, readMs: 1, sendMs: 1 };
		},
	}),
);

const { CACHE_PUSH_CONCURRENCY, createCachePushConsumer } = await import(
	"../../../../src/consumers/cachePush/cachePushConsumer.js"
);
const { createCachePushQueue } = await import(
	"../../../../src/consumers/cachePush/pushQueue/createCachePushQueue.js"
);

const identityOf = (customerId: string) => ({
	orgId: "org_1",
	env: AppEnv.Live,
	customerId,
	entityId: null,
});

const recordFor = ({
	customerId,
	offset,
}: {
	customerId: string;
	offset: number;
}) =>
	({
		position: { topic: "t", partition: 0, offset: BigInt(offset) },
		record: { identity: identityOf(customerId), command: { occurredAt: 1 } },
	}) as unknown as StreamRecord;

const logger = { info: () => {}, warn: () => {} };

const closeGate = () => {
	gate = new Promise((resolve) => {
		release = resolve;
	});
};
const openGate = () => release?.();

const settle = async () => {
	for (let i = 0; i < 50 && inFlight > 0; i++) await Bun.sleep(5);
};

test("a slice is queued, not awaited: handle returns while its pushes are still in flight", async () => {
	pushed.length = 0;
	closeGate();
	const consumer = createCachePushConsumer({ ctx: { logger } as never });
	await consumer.handle({
		records: [recordFor({ customerId: "cus_a", offset: 1 })],
	});
	expect(pushed).toEqual([]);
	openGate();
	await settle();
	expect(pushed).toEqual(["cus_a@1"]);
});

test("pushes run up to the pool's cap at once, each subject once", async () => {
	pushed.length = 0;
	peak = 0;
	closeGate();
	const consumer = createCachePushConsumer({ ctx: { logger } as never });
	const records = Array.from({ length: 200 }, (_, index) =>
		recordFor({ customerId: `cus_${index % 150}`, offset: index }),
	);
	await consumer.handle({ records });
	await Bun.sleep(5);
	expect(peak).toBe(CACHE_PUSH_CONCURRENCY);
	openGate();
	await settle();
	expect(pushed).toHaveLength(150);
});

test("a subject still waiting when it changes again is pushed once, at its newest offset", async () => {
	pushed.length = 0;
	closeGate();
	const queue = createCachePushQueue({
		push: async ({ cacheSubject }) => {
			const { pushSubjectToCache } = await import(
				"../../../../src/consumers/cachePush/pushSubjectToCache/pushSubjectToCache.js"
			);
			await pushSubjectToCache({ ctx: {} as never, cacheSubject });
		},
		concurrency: 1,
		maxPending: 100,
	});
	const subject = (offset: number) => ({
		identity: identityOf("cus_hot"),
		logOffset: BigInt(offset),
		oldestOccurredAt: offset,
	});
	queue.enqueue({ subjects: [subject(1)] });
	queue.enqueue({ subjects: [subject(3)] });
	queue.enqueue({ subjects: [subject(2)] });
	expect(queue.activeCount()).toBe(1);
	expect(queue.pendingCount()).toBe(1);
	openGate();
	await settle();
	await Bun.sleep(10);
	expect(pushed).toEqual(["cus_hot@1", "cus_hot@3"]);
});

test("a full queue holds the slice until pushes make room", async () => {
	closeGate();
	const queue = createCachePushQueue({
		push: async () => {
			await gate;
		},
		concurrency: 1,
		maxPending: 2,
	});
	queue.enqueue({
		subjects: ["a", "b", "c"].map((id, offset) => ({
			identity: identityOf(id),
			logOffset: BigInt(offset),
			oldestOccurredAt: offset,
		})),
	});
	let roomed = false;
	const room = queue.waitForRoom().then(() => {
		roomed = true;
	});
	await Bun.sleep(5);
	expect(roomed).toBe(false);
	openGate();
	await room;
	expect(roomed).toBe(true);
});

test("a subject pushed once for several changes reports the age of its oldest change", async () => {
	closeGate();
	const ages: number[] = [];
	const queue = createCachePushQueue({
		push: async ({ cacheSubject }) => {
			await gate;
			ages.push(cacheSubject.oldestOccurredAt);
		},
		concurrency: 1,
		maxPending: 100,
	});
	const { recordsToCacheSubjects } = await import(
		"../../../../src/consumers/cachePush/utils/recordsToCacheSubjects.js"
	);
	const at = (offset: number, occurredAt: number) =>
		({
			position: { topic: "t", partition: 0, offset: BigInt(offset) },
			record: { identity: identityOf("cus_hot"), command: { occurredAt } },
		}) as unknown as StreamRecord;
	queue.enqueue({
		subjects: recordsToCacheSubjects({ records: [at(1, 100)] }),
	});
	queue.enqueue({
		subjects: recordsToCacheSubjects({ records: [at(2, 200), at(3, 300)] }),
	});
	queue.enqueue({
		subjects: recordsToCacheSubjects({ records: [at(4, 400)] }),
	});
	openGate();
	for (let i = 0; i < 50 && ages.length < 2; i++) await Bun.sleep(5);
	expect(ages).toEqual([100, 200]);
});

test("stop waits for every queued push, since the slices that named them are already committed", async () => {
	pushed.length = 0;
	closeGate();
	const consumer = createCachePushConsumer({ ctx: { logger } as never });
	await consumer.handle({
		records: Array.from({ length: CACHE_PUSH_CONCURRENCY + 2 }, (_, index) =>
			recordFor({ customerId: `cus_stop_${index}`, offset: index }),
		),
	});
	let stopped = false;
	const stopping = consumer.stop?.().then(() => {
		stopped = true;
	});
	await Bun.sleep(5);
	expect(stopped).toBe(false);
	openGate();
	await stopping;
	expect(pushed).toHaveLength(CACHE_PUSH_CONCURRENCY + 2);
});
