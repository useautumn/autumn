import { expect, test } from "bun:test";
import {
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
} from "../../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createUsageEventsConsumer } from "../../../../src/consumers/usageEvents/usageEventsConsumer.js";
import type { StreamRecord } from "../../../../src/stream/types/streamConsumer.js";

const trackStreamRecord = (): StreamRecord => {
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
		position: { topic: "local-events", partition: 0, offset: 1n },
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
