import { expect, test } from "bun:test";
import {
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { TinybirdIngestError } from "@autumn/tinybird";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
} from "../../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createUsageEventsConsumer } from "../../../../src/consumers/usageEvents/usageEventsConsumer.js";
import type { StreamRecord } from "../../../../src/stream/types/streamConsumer.js";

const trackStreamRecord = ({
	offset = 1n,
}: {
	offset?: bigint;
} = {}): StreamRecord => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
	});
	const mutation = computeTrack({
		fullSubject: subjectStateToFullSubject({
			state,
			catalog: createCatalogFor({ state }),
		}),
		command: createTrackCommand({ value: 3 }),
	});
	return {
		position: { topic: "local-events", partition: 0, offset },
		record: { ...mutation, receipt: { fingerprint: "f", expiresAt: 1 } },
	};
};

const logger = { error: () => {} };
const at = new Date("2026-09-28T00:00:00Z");

/**
 * The ledger as Postgres would keep it, plus a Tinybird that can be told to fail: every call recorded in order.
 * Rows survive across handles, the way the table does; nothing here lives in the consumer.
 */
const createStores = ({
	tinybirdFailures = [],
	postgresFailures = 0,
}: {
	tinybirdFailures?: Error[];
	postgresFailures?: number;
} = {}) => {
	const calls: string[] = [];
	const rows = new Map<string, { sent: boolean }>();
	const pendingTinybirdFailures = [...tinybirdFailures];
	let pendingPostgresFailures = postgresFailures;
	const consumer = createUsageEventsConsumer({
		ctx: {
			logger,
			now: () => at,
			eventsTinybird: {
				sendUsageEvents: async ({ events }) => {
					calls.push(`tinybird:${events.map(({ id }) => id).join(",")}`);
					const failure = pendingTinybirdFailures.shift();
					if (failure) throw failure;
				},
			},
			eventsDb: {
				insertUsageEvents: async ({ events }) => {
					if (pendingPostgresFailures > 0) {
						pendingPostgresFailures -= 1;
						throw new Error("Postgres is down");
					}
					const insertedIds: string[] = [];
					for (const { id } of events) {
						if (rows.has(id)) continue;
						rows.set(id, { sent: false });
						insertedIds.push(id);
					}
					calls.push(`insert:${insertedIds.join(",")}`);
					return { insertedIds, refused: [] };
				},
				readUnsentToTinybirdIds: async ({ ids }) =>
					ids.filter((id) => rows.get(id)?.sent === false),
				markSentToTinybird: async ({ ids, at: markedAt }) => {
					calls.push(`mark:${ids.join(",")}@${markedAt.toISOString()}`);
					for (const id of ids) {
						const row = rows.get(id);
						if (row) row.sent = true;
					}
				},
			},
		},
	});
	return { consumer, calls };
};

const one = () => [trackStreamRecord()];
const two = () => [
	trackStreamRecord({ offset: 1n }),
	trackStreamRecord({ offset: 2n }),
];

test("a slice inserts into Postgres, sends Tinybird what is unsent, then marks it", async () => {
	const { consumer, calls } = createStores();
	await consumer.handle({ records: one() });
	expect(calls).toEqual([
		"insert:local-events:0:1",
		"tinybird:local-events:0:1",
		"mark:local-events:0:1@2026-09-28T00:00:00.000Z",
	]);
});

test("the same slice landed again sends nothing to Tinybird", async () => {
	const { consumer, calls } = createStores();
	await consumer.handle({ records: one() });
	await consumer.handle({ records: one() });
	expect(calls).toEqual([
		"insert:local-events:0:1",
		"tinybird:local-events:0:1",
		"mark:local-events:0:1@2026-09-28T00:00:00.000Z",
		"insert:",
	]);
});

test("a slice that failed at Tinybird after inserting sends on the retry: inserted, never lost", async () => {
	const { consumer, calls } = createStores({
		tinybirdFailures: [new Error("Tinybird is down")],
	});
	await consumer.handle({ records: one() }).catch(() => {});
	await consumer.handle({ records: one() });
	expect(calls).toEqual([
		"insert:local-events:0:1",
		"tinybird:local-events:0:1",
		"insert:",
		"tinybird:local-events:0:1",
		"mark:local-events:0:1@2026-09-28T00:00:00.000Z",
	]);
});

test("a request that wrote some rows before failing marks those, so the retry sends only the rest", async () => {
	const { consumer, calls } = createStores({
		tinybirdFailures: [
			new TinybirdIngestError({
				writtenRows: 1,
				cause: new Error("socket hang up"),
			}),
		],
	});
	await consumer.handle({ records: two() }).catch(() => {});
	await consumer.handle({ records: two() });
	expect(calls).toEqual([
		"insert:local-events:0:1,local-events:0:2",
		"tinybird:local-events:0:1,local-events:0:2",
		"mark:local-events:0:1@2026-09-28T00:00:00.000Z",
		"insert:",
		"tinybird:local-events:0:2",
		"mark:local-events:0:2@2026-09-28T00:00:00.000Z",
	]);
});

test("a Postgres failure fails the slice before Tinybird is touched", async () => {
	const { consumer, calls } = createStores({ postgresFailures: 1 });
	const failure = await consumer
		.handle({ records: one() })
		.catch((error: unknown) => error);
	expect(failure).toBeInstanceOf(Error);
	expect(calls).toEqual([]);
});

test("without Tinybird, Postgres is the only store and nothing is marked", async () => {
	const calls: string[] = [];
	const consumer = createUsageEventsConsumer({
		ctx: {
			logger,
			eventsTinybird: null,
			eventsDb: {
				insertUsageEvents: async ({ events }) => {
					calls.push(`insert:${events.map(({ id }) => id).join(",")}`);
					return { insertedIds: [], refused: [] };
				},
				readUnsentToTinybirdIds: async () => {
					calls.push("read");
					return [];
				},
				markSentToTinybird: async () => {
					calls.push("mark");
				},
			},
		},
	});
	await consumer.handle({ records: one() });
	expect(calls).toEqual(["insert:local-events:0:1"]);
});
