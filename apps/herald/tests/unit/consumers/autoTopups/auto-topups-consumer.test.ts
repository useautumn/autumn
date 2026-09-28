import { expect, test } from "bun:test";
import type { AutoTopupJobPayload } from "@autumn/auto-topup";
import type { MutationEffect } from "@autumn/balance-engine";
import {
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import type { MiscCache } from "@autumn/cache";
import { AppEnv } from "@autumn/shared";
import type { SqsJobs } from "@autumn/sqs";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
} from "../../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createAutoTopupsConsumer } from "../../../../src/consumers/autoTopups/autoTopupsConsumer.js";
import type { StreamRecord } from "../../../../src/stream/types/streamConsumer.js";

/** A track as a newer worker logs it, with whatever effects it decided. */
const trackWith = ({
	offset,
	effects,
}: {
	offset: bigint;
	effects?: MutationEffect[];
}): StreamRecord => {
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
		record: {
			...mutation,
			receipt: { fingerprint: "f", expiresAt: 1 },
			...(effects && { effects }),
		},
	};
};

const belowThreshold: MutationEffect = {
	type: "auto_topup",
	featureId: "messages",
	reason: "balance_below_threshold",
};

const logger = { info() {}, warn() {}, error() {} };

/** A misc cache whose Redis remembers NX sets, the way the pending key is claimed. */
const miscCacheOf = () => {
	const keys = new Set<string>();
	const redis = {
		status: "ready",
		async set(key: string) {
			if (keys.has(key)) return null;
			keys.add(key);
			return "OK";
		},
		async del(key: string) {
			keys.delete(key);
		},
	};
	return { getActive: () => redis } as unknown as Pick<MiscCache, "getActive">;
};

const consumerOf = ({ sent }: { sent: AutoTopupJobPayload[] }) =>
	createAutoTopupsConsumer({
		ctx: {
			logger,
			miscCache: miscCacheOf(),
			sqsJobs: {
				autoTopup: {
					trySend: async (payload: AutoTopupJobPayload) => {
						sent.push(payload);
						return { sent: true };
					},
				},
			} as unknown as Pick<SqsJobs, "autoTopup">,
		},
	});

test("an auto top-up effect enqueues one job for the record's customer and the effect's feature", async () => {
	const sent: AutoTopupJobPayload[] = [];

	await consumerOf({ sent }).handle({
		records: [trackWith({ offset: 1n, effects: [belowThreshold] })],
	});

	expect(sent).toEqual([
		{
			orgId: identity.orgId,
			env: AppEnv.Sandbox,
			customerId: identity.customerId,
			featureId: "messages",
		},
	]);
});

test("a second effect for the same customer and feature inside the pending window enqueues nothing", async () => {
	const sent: AutoTopupJobPayload[] = [];

	await consumerOf({ sent }).handle({
		records: [
			trackWith({ offset: 1n, effects: [belowThreshold] }),
			trackWith({ offset: 2n, effects: [belowThreshold] }),
		],
	});

	expect(sent).toHaveLength(1);
});

test("a record with no auto top-up effect enqueues nothing", async () => {
	const sent: AutoTopupJobPayload[] = [];

	await consumerOf({ sent }).handle({
		records: [
			trackWith({ offset: 1n }),
			trackWith({
				offset: 2n,
				effects: [
					{
						type: "balance_webhook",
						eventType: "balances.limit_reached",
						data: {},
						tags: [],
					},
				],
			}),
		],
	});

	expect(sent).toEqual([]);
});
