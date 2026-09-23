import { expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	createSubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import type { CatalogCache } from "@autumn/catalog-lru";
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

/** A track of `value` against an allowance of 10, as the log carries it. */
const trackOf = ({ value }: { value: number }): StreamRecord => {
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
			...createTrackCommand({ value, overageBehavior: "cap" }),
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
			after: { state: after },
		},
	};
};

const emptyingTrack = (): StreamRecord => trackOf({ value: 10 });

const logger = { info() {}, warn() {}, error() {} };

/** Answers every key from the fixture's catalog, as a warm cache would. */
const catalogCache: Pick<CatalogCache, "read" | "load"> = {
	read: () =>
		createCatalogFor({ state: emptyingTrack().record.after?.state as never }),
	load: async () => {},
};

test("a record's webhooks go to the app its org delivers through in that env", async () => {
	const sent: { appId: string; eventType: string }[] = [];
	const consumer = createBalanceWebhooksConsumer({
		ctx: {
			logger,
			catalogCache,
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
		ctx: { logger, catalogCache, svix: null },
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
			catalogCache,
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

test("a track that leaves some allowance delivers nothing", async () => {
	const sent: string[] = [];
	const consumer = createBalanceWebhooksConsumer({
		ctx: {
			logger,
			catalogCache,
			svix: {
				sendMessage: async ({ message }: { message: SvixMessage }) => {
					sent.push(message.eventType);
				},
			} as unknown as SvixClient,
		},
	});

	await consumer.handle({ records: [trackOf({ value: 3 })] });

	expect(sent).toEqual([]);
});
