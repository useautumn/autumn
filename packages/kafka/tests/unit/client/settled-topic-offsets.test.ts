import { describe, expect, test } from "bun:test";
import type { Admin } from "kafkajs";
import { KafkaJSNumberOfRetriesExceeded } from "kafkajs";
import { KafkaTopicPartitionsUnavailableError } from "../../../src/client/kafkaErrors.js";
import {
	createSettledAdmin,
	isEmptyTopicMetadataFailure,
} from "../../../src/client/settledTopicOffsets.js";

const topic = "tf-balance-staging-v2-64-ownership";

const answered = [{ partition: 0, offset: "7", high: "7", low: "0" }];

function emptyPartitions(): TypeError {
	return new TypeError(
		"Cannot destructure property 'partitions' from null or undefined value",
	);
}

type FakeAdmin = {
	admin: Admin;
	connects: number;
	disconnects: number;
	reads: number;
	byTimestampReads: number;
};

/** An admin that answers with `failures` poisoned reads before a real one. */
function createFakeAdmin({
	failures,
	failWith = emptyPartitions,
}: {
	failures: number;
	failWith?: () => unknown;
}): FakeAdmin {
	const fake: FakeAdmin = {
		admin: {} as Admin,
		connects: 0,
		disconnects: 0,
		reads: 0,
		byTimestampReads: 0,
	};
	let remaining = failures;
	async function connect(): Promise<void> {
		fake.connects += 1;
	}
	async function disconnect(): Promise<void> {
		fake.disconnects += 1;
	}
	async function fetchTopicOffsets(): Promise<typeof answered> {
		fake.reads += 1;
		if (remaining > 0) {
			remaining -= 1;
			const failure = failWith();
			if (failure instanceof Error) throw failure;
			return [];
		}
		return answered;
	}
	async function fetchTopicOffsetsByTimestamp(): Promise<
		{ partition: number; offset: string }[]
	> {
		fake.byTimestampReads += 1;
		return [{ partition: 0, offset: "3" }];
	}
	fake.admin = {
		connect,
		disconnect,
		fetchTopicOffsets,
		fetchTopicOffsetsByTimestamp,
	} as unknown as Admin;
	return fake;
}

function createFactory(plan: FakeAdmin[]) {
	const created: FakeAdmin[] = [];
	function createAdmin(): Admin {
		const next = plan[created.length];
		if (!next) throw new Error("no more admins planned");
		created.push(next);
		return next.admin;
	}
	return { createAdmin, created };
}

/** A clock that advances only while the retry sleeps. */
function createFastRetry({ deadlineMs = 3 }: { deadlineMs?: number } = {}) {
	let tick = 0;
	return {
		deadlineMs,
		backoffMs: 1,
		now: () => tick,
		sleep: async (ms: number) => {
			tick += ms;
		},
	};
}

describe("settled topic offsets", () => {
	test("a poisoned reply is retried on a fresh, connected admin", async () => {
		const poisoned = createFakeAdmin({ failures: 5 });
		const healthy = createFakeAdmin({ failures: 0 });
		const factory = createFactory([poisoned, healthy]);
		const admin = createSettledAdmin({
			createAdmin: factory.createAdmin,
			retry: createFastRetry(),
		});
		await admin.connect();
		const offsets = await admin.fetchTopicOffsets(topic);
		expect(offsets).toEqual(answered);
		expect(poisoned.reads).toBe(1);
		expect(healthy.reads).toBe(1);
		expect(healthy.connects).toBe(1);
		// The poisoned admin stays up for anyone mid-flight on it.
		expect(poisoned.disconnects).toBe(0);
		await admin.disconnect();
		expect(poisoned.disconnects).toBe(1);
		expect(healthy.disconnects).toBe(1);
	});

	test("an empty reply counts as poisoned too", async () => {
		const poisoned = createFakeAdmin({ failures: 1, failWith: () => null });
		const healthy = createFakeAdmin({ failures: 0 });
		const factory = createFactory([poisoned, healthy]);
		const admin = createSettledAdmin({
			createAdmin: factory.createAdmin,
			retry: createFastRetry(),
		});
		expect(await admin.fetchTopicOffsets(topic)).toEqual(answered);
		expect(factory.created).toHaveLength(2);
		// Never connected, so the replacement is not connected either.
		expect(healthy.connects).toBe(0);
	});

	test("kafkajs giving up on the same TypeError is looked through", async () => {
		function exhausted(): Error {
			return new KafkaJSNumberOfRetriesExceeded(emptyPartitions(), {
				retryCount: 2,
				retryTime: 300,
			});
		}
		expect(isEmptyTopicMetadataFailure(exhausted())).toBe(true);
		const poisoned = createFakeAdmin({ failures: 1, failWith: exhausted });
		const healthy = createFakeAdmin({ failures: 0 });
		const factory = createFactory([poisoned, healthy]);
		const admin = createSettledAdmin({
			createAdmin: factory.createAdmin,
			retry: createFastRetry(),
		});
		expect(await admin.fetchTopicOffsets(topic)).toEqual(answered);
	});

	test("any other failure passes through untouched", async () => {
		const refused = new Error("Not authorized to access topics");
		const broken = createFakeAdmin({ failures: 1, failWith: () => refused });
		const factory = createFactory([broken, createFakeAdmin({ failures: 0 })]);
		const admin = createSettledAdmin({
			createAdmin: factory.createAdmin,
			retry: createFastRetry(),
		});
		await expect(admin.fetchTopicOffsets(topic)).rejects.toBe(refused);
		expect(factory.created).toHaveLength(1);
	});

	test("past the deadline the topic is reported unavailable", async () => {
		const plan = [
			createFakeAdmin({ failures: 9 }),
			createFakeAdmin({ failures: 9 }),
			createFakeAdmin({ failures: 9 }),
			createFakeAdmin({ failures: 9 }),
		];
		const factory = createFactory(plan);
		const admin = createSettledAdmin({
			createAdmin: factory.createAdmin,
			retry: createFastRetry({ deadlineMs: 2 }),
		});
		const failure = admin.fetchTopicOffsets(topic);
		await expect(failure).rejects.toBeInstanceOf(
			KafkaTopicPartitionsUnavailableError,
		);
		// Attempts at ticks 0, 1 and 2; the wait after the third would pass the deadline.
		expect(factory.created).toHaveLength(3);
	});

	test("concurrent readers of one poisoned reply share a replacement", async () => {
		const poisoned = createFakeAdmin({ failures: 2 });
		const healthy = createFakeAdmin({ failures: 0 });
		const factory = createFactory([poisoned, healthy]);
		const admin = createSettledAdmin({
			createAdmin: factory.createAdmin,
			retry: createFastRetry(),
		});
		const [first, second] = await Promise.all([
			admin.fetchTopicOffsets(topic),
			admin.fetchTopicOffsets(topic),
		]);
		expect(first).toEqual(answered);
		expect(second).toEqual(answered);
		expect(factory.created).toHaveLength(2);
	});

	test("other admin calls follow the replacement", async () => {
		const poisoned = createFakeAdmin({ failures: 1 });
		const healthy = createFakeAdmin({ failures: 0 });
		const factory = createFactory([poisoned, healthy]);
		const admin = createSettledAdmin({
			createAdmin: factory.createAdmin,
			retry: createFastRetry(),
		});
		await admin.fetchTopicOffsets(topic);
		await admin.fetchTopicOffsetsByTimestamp(topic, 1);
		expect(poisoned.byTimestampReads).toBe(0);
		expect(healthy.byTimestampReads).toBe(1);
	});
});
