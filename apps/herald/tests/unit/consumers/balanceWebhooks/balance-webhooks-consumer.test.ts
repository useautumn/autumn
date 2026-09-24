import { expect, test } from "bun:test";
import {
	computeTrack,
	createSubjectState,
	type MutationEffect,
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

const limitReached: MutationEffect = {
	type: "balance_webhook",
	eventType: "balances.limit_reached",
	data: { customer_id: identity.customerId, feature_id: "messages" },
	tags: [`customer_id.${identity.customerId}`],
};

const topUp: MutationEffect = {
	type: "auto_topup",
	featureId: "messages",
	reason: "balance_below_threshold",
};

/** A track as the worker logs it, with whatever effects it decided. */
const trackWith = ({
	effects,
}: {
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
		command: {
			...createTrackCommand({ value: 10, overageBehavior: "cap" }),
			org: {
				...createTrackCommand().org,
				svix: { sandbox_app_id: "app_sandbox_1", live_app_id: null },
			},
		},
	});
	return {
		position: { topic: "local-events", partition: 0, offset: 1n },
		record: {
			...mutation,
			receipt: { fingerprint: "f", expiresAt: 1 },
			...(effects && { effects }),
		},
	};
};

const logger = { info() {}, warn() {}, error() {} };

const svixThat = (
	sendMessage: (params: {
		appId: string;
		message: SvixMessage;
	}) => Promise<void>,
): SvixClient => ({ sendMessage }) as unknown as SvixClient;

test("a record's webhook effects go to the app its org delivers through in that env; other effects are not its business", async () => {
	const sent: { appId: string; eventType: string }[] = [];
	const consumer = createBalanceWebhooksConsumer({
		ctx: {
			logger,
			svix: svixThat(async ({ appId, message }) => {
				sent.push({ appId, eventType: message.eventType });
			}),
		},
	});

	await consumer.handle({
		records: [trackWith({ effects: [limitReached, topUp] })],
	});

	expect(sent).toEqual([
		{ appId: "app_sandbox_1", eventType: "balances.limit_reached" },
	]);
});

test("without Svix the job reads the log and delivers nothing", async () => {
	const consumer = createBalanceWebhooksConsumer({
		ctx: { logger, svix: null },
	});

	await expect(
		consumer.handle({ records: [trackWith({ effects: [limitReached] })] }),
	).resolves.toBeUndefined();
});

test("a send that fails is logged and does not stop the batch", async () => {
	const errors: unknown[] = [];
	const consumer = createBalanceWebhooksConsumer({
		ctx: {
			logger: { ...logger, error: (...args: unknown[]) => errors.push(args) },
			svix: svixThat(async () => {
				throw new Error("svix is down");
			}),
		},
	});

	await expect(
		consumer.handle({
			records: [
				trackWith({ effects: [limitReached] }),
				trackWith({ effects: [limitReached] }),
			],
		}),
	).resolves.toBeUndefined();
	expect(errors).toHaveLength(2);
});

test("a record with no webhook effects delivers nothing", async () => {
	const sent: string[] = [];
	const consumer = createBalanceWebhooksConsumer({
		ctx: {
			logger,
			svix: svixThat(async ({ message }) => {
				sent.push(message.eventType);
			}),
		},
	});

	await consumer.handle({
		records: [
			trackWith({}),
			trackWith({ effects: [] }),
			trackWith({ effects: [topUp] }),
		],
	});

	expect(sent).toEqual([]);
});
