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

test("the same event goes to Tinybird first, then Postgres", async () => {
	const calls: { store: string; ids: string[] }[] = [];
	const consumer = createUsageEventsConsumer({
		ctx: {
			logger,
			eventsTinybird: {
				sendUsageEvents: async ({ events }) => {
					calls.push({ store: "tinybird", ids: events.map(({ id }) => id) });
				},
			},
			eventsDb: {
				insertUsageEvents: async ({ events }) => {
					calls.push({ store: "postgres", ids: events.map(({ id }) => id) });
					return { insertedIds: [], refused: [] };
				},
			},
		},
	});

	await consumer.handle({ records: [trackStreamRecord()] });

	expect(calls).toEqual([
		{ store: "tinybird", ids: ["local-events:0:1"] },
		{ store: "postgres", ids: ["local-events:0:1"] },
	]);
});

test("a Tinybird failure fails the batch before Postgres is touched", async () => {
	let insertedIntoPostgres = false;
	const consumer = createUsageEventsConsumer({
		ctx: {
			logger,
			eventsTinybird: {
				sendUsageEvents: async () => {
					throw new Error("Tinybird is down");
				},
			},
			eventsDb: {
				insertUsageEvents: async () => {
					insertedIntoPostgres = true;
					return { insertedIds: [], refused: [] };
				},
			},
		},
	});

	const failure = await consumer
		.handle({ records: [trackStreamRecord()] })
		.catch((error: unknown) => error);

	expect(failure).toBeInstanceOf(Error);
	expect(insertedIntoPostgres).toBe(false);
});

/** Records every store call; Tinybird fails once with `tinybirdFailure`, Postgres fails `postgresFailures` times. */
const createRecordingStores = ({
	tinybirdFailure,
	postgresFailures = 0,
}: {
	tinybirdFailure?: Error;
	postgresFailures?: number;
}) => {
	const tinybirdIds: string[][] = [];
	let pendingTinybirdFailure = tinybirdFailure;
	let pendingPostgresFailures = postgresFailures;
	const consumer = createUsageEventsConsumer({
		ctx: {
			logger,
			eventsTinybird: {
				sendUsageEvents: async ({ events }) => {
					tinybirdIds.push(events.map(({ id }) => id));
					const failure = pendingTinybirdFailure;
					pendingTinybirdFailure = undefined;
					if (failure) throw failure;
				},
			},
			eventsDb: {
				insertUsageEvents: async () => {
					if (pendingPostgresFailures > 0) {
						pendingPostgresFailures -= 1;
						throw new Error("Postgres is down");
					}
					return { insertedIds: [], refused: [] };
				},
			},
		},
	});
	return { consumer, tinybirdIds };
};

test("a retried batch resends to Tinybird only the events its failed attempt did not write", async () => {
	const { consumer, tinybirdIds } = createRecordingStores({
		tinybirdFailure: new TinybirdIngestError({
			writtenRows: 1,
			cause: new Error("socket hang up"),
		}),
	});
	const records = [
		trackStreamRecord({ offset: 1n }),
		trackStreamRecord({ offset: 2n }),
	];

	await consumer.handle({ records }).catch(() => {});
	await consumer.handle({ records });

	expect(tinybirdIds).toEqual([
		["local-events:0:1", "local-events:0:2"],
		["local-events:0:2"],
	]);
});

test("a batch retried after Postgres failed does not resend to Tinybird", async () => {
	const { consumer, tinybirdIds } = createRecordingStores({
		postgresFailures: 1,
	});
	const records = [trackStreamRecord()];

	await consumer.handle({ records }).catch(() => {});
	await consumer.handle({ records });

	expect(tinybirdIds).toEqual([["local-events:0:1"], []]);
});

test("the same records in a new batch are sent in full", async () => {
	const { consumer, tinybirdIds } = createRecordingStores({});

	await consumer.handle({ records: [trackStreamRecord()] });
	await consumer.handle({ records: [trackStreamRecord()] });

	expect(tinybirdIds).toEqual([["local-events:0:1"], ["local-events:0:1"]]);
});
