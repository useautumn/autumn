import { expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import type { SvixClient, SvixMessage } from "@autumn/svix";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
} from "../../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createBalanceWebhooksConsumer } from "../../../../src/consumers/balanceWebhooks/balanceWebhooksConsumer.js";
import type { StreamRecord } from "../../../../src/stream/types/streamConsumer.js";

/** A track that empties the allowance, as the log carries it. */
const emptyingTrack = (): StreamRecord => {
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
		command: {
			...createTrackCommand({ value: 10, overageBehavior: "cap" }),
			org: {
				...createTrackCommand().org,
				svix: { sandbox_app_id: "app_sandbox_1", live_app_id: null },
			},
		},
	});
	const after = applyMutation({ state, mutation });
	return {
		position: { topic: "local-events", partition: 0, offset: 1n },
		record: {
			...mutation,
			receipt: { fingerprint: "f", expiresAt: 1 },
			after: { state: after, catalog: createCatalogFor({ state: after }) },
		},
	};
};

const logger = { info() {}, warn() {}, error() {} };

test("a record's webhooks go to the app its org delivers through in that env", async () => {
	const sent: { appId: string; eventType: string }[] = [];
	const consumer = createBalanceWebhooksConsumer({
		ctx: {
			logger,
			svix: {
				sendMessage: async ({
					appId,
					message,
				}: {
					appId: string;
					message: SvixMessage;
				}) => {
					sent.push({ appId, eventType: message.eventType });
				},
			} as unknown as SvixClient,
		},
	});

	await consumer.handle({ records: [emptyingTrack()] });

	expect(sent).toEqual([
		{ appId: "app_sandbox_1", eventType: "balances.limit_reached" },
	]);
});

test("without Svix the job reads the log and delivers nothing", async () => {
	const consumer = createBalanceWebhooksConsumer({
		ctx: { logger, svix: null },
	});

	await expect(
		consumer.handle({ records: [emptyingTrack()] }),
	).resolves.toBeUndefined();
});

test("a send that fails is logged and does not stop the batch", async () => {
	const errors: unknown[] = [];
	const consumer = createBalanceWebhooksConsumer({
		ctx: {
			logger: { ...logger, error: (...args: unknown[]) => errors.push(args) },
			svix: {
				sendMessage: async () => {
					throw new Error("svix is down");
				},
			} as unknown as SvixClient,
		},
	});

	await expect(
		consumer.handle({ records: [emptyingTrack(), emptyingTrack()] }),
	).resolves.toBeUndefined();
	expect(errors).toHaveLength(2);
});
