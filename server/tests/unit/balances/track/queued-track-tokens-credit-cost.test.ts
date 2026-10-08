import { afterAll, describe, expect, mock, test } from "bun:test";
import {
	ApiVersionClass,
	AppEnv,
	FeatureType,
	LATEST_VERSION,
} from "@autumn/shared";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { createFakeMiscCache } from "../../utils/fakeMiscCache.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";
import { pinTrackProducerQueueToFifo } from "./trackAsyncQueueTestEnv.js";

// A track_tokens queued by default must replay with the token cost, so its event
// records the same credit_cost as the sync path. Pre-fix the queue message dropped it.

const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";

const trackAsyncQueueUrl =
	"https://sqs.eu-west-1.amazonaws.com/123456789012/track-async-dev.fifo";
const replayedDeductions: unknown[][] = [];

await mockModuleWithRestore(
	"@/internal/features/aiCreditSystemUtils.js",
	() => ({
		getModelCreditCostBreakdown: async () => ({
			cost: 120,
			baseCost: 120,
			markup: 0,
			markupSource: "default",
			tierApplied: false,
			rates: {
				input: 5,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				audioInput: 0,
				audioOutput: 0,
				reasoning: 0,
			},
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/utils/getSubjectFullCustomer.js",
	() => ({
		getSubjectFullCustomer: async () => ({
			id: "cus_123",
			customer_products: [],
			extra_customer_entitlements: [],
			entities: [],
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/track/v3/runTrackV3.js",
	() => ({
		runTrackV3: async ({
			featureDeductions,
		}: {
			featureDeductions: unknown[];
		}) => {
			replayedDeductions.push(featureDeductions);
			return { customer_id: "cus_123", balance: null };
		},
	}),
);
await mockModuleWithRestore(
	"@/external/aws/dynamodb/idempotencyKeys/operations/claimDynamoIdempotencyKey.js",
	() => ({ claimDynamoIdempotencyKey: async () => "claimed" }),
);
const fakeMiscCache = createFakeMiscCache({
	main: {
		status: "ready",
		get: async () => null,
		set: async () => "OK",
		del: async () => 1,
	} as never,
});
await mockModuleWithRestore(
	"@/external/redis/miscCache/getMiscCache.js",
	() => ({
		getMiscCache: () => fakeMiscCache,
	}),
);

const { handleTrackTokens } = await import(
	"@/internal/balances/handlers/handleTrackTokens.js"
);
const { runQueuedTrack } = await import(
	"@/internal/balances/track/runQueuedTrack.js"
);
const { getTokenTrackParams } = await import(
	"@/internal/balances/track/utils/getTokenTrackParams.js"
);
const { runBatchTrackTokens } = await import(
	"@/internal/balances/track/runBatchTrackTokens.js"
);
const { buildAiCreditCostProperty } = await import("@autumn/shared");

const aiCredits = { id: "ai_credits", type: FeatureType.AiCreditSystem };
const createCtx = (): AutumnContext =>
	({
		id: "req_queued_tokens",
		org: { id: "org_123", slug: "test-org" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		features: [aiCredits],
		extraLogs: {},
		scopes: [],
		skipCache: false,
		logger: {
			info: mock(() => {}),
			warn: mock(() => {}),
			error: mock(() => {}),
			debug: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const requestBody = {
	customer_id: "cus_123",
	feature_id: "ai_credits",
	model_id: "custom/internal-model",
	input_tokens: 24_000_000,
	output_tokens: 0,
};

// $120 drained $100 of AI credits and overflowed 20,000 orbs.
const drawn = [
	{ featureId: "ai_credits", amount: 100 },
	{ featureId: "orbs", amount: 20_000 },
];

type QueuedTrackMessage = Omit<Parameters<typeof runQueuedTrack>[0], "ctx">;

/** The credit_cost runRedisTrackV3 records for these deductions over the draws above. */
const creditCostOf = (
	featureDeductions: { feature: { id: string }; tokens?: unknown }[],
) => {
	const aiCreditFeatureId = featureDeductions.find(
		(deduction) => deduction.tokens,
	)?.feature.id;
	return (
		aiCreditFeatureId &&
		buildAiCreditCostProperty({ aiCreditFeatureId, entries: drawn })
	);
};

const captureQueuedMessages = async (
	send: () => Promise<unknown>,
): Promise<QueuedTrackMessage[]> => {
	const { restore } = pinTrackProducerQueueToFifo({
		fifoQueueUrl: trackAsyncQueueUrl,
	});
	const sqsClient = getSqsClient({ queueUrl: trackAsyncQueueUrl });
	const originalSend = sqsClient.send.bind(sqsClient);
	const sent: Record<string, unknown>[] = [];
	sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
		sent.push(command.input);
		const entries =
			(command.input.Entries as Array<{ Id?: string }> | undefined) ?? [];
		return { Successful: entries.map((entry) => ({ Id: entry.Id })) };
	}) as typeof sqsClient.send;

	try {
		await send();
	} finally {
		sqsClient.send = originalSend;
		restore();
	}

	return sent.flatMap((input) =>
		(input.Entries as Array<{ MessageBody: string }>).map(
			(entry) => JSON.parse(entry.MessageBody).data,
		),
	);
};

const queueDefaultTrackTokens = async () => {
	const [message] = await captureQueuedMessages(async () => {
		const app = new Hono<HonoEnv>();
		app.use("*", async (c, next) => {
			c.set("ctx", createCtx());
			await next();
		});
		app.post("/track_tokens", ...handleTrackTokens);
		const response = await app.request("/track_tokens", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(requestBody),
		});
		expect(response.status).toBe(202);
	});
	return message;
};

describe("queued track_tokens credit_cost", () => {
	test("a default (queued) track_tokens replays with the same credit_cost as the sync path", async () => {
		const sync = await getTokenTrackParams({
			ctx: createCtx(),
			input: requestBody,
		});
		const syncCreditCost = creditCostOf(sync.featureDeductions);

		const queuedMessage = await queueDefaultTrackTokens();
		await runQueuedTrack({ ctx: createCtx(), ...queuedMessage });
		const queuedCreditCost = creditCostOf(
			replayedDeductions[0] as typeof sync.featureDeductions,
		);

		expect(replayedDeductions[0]).toEqual(sync.featureDeductions);
		expect(syncCreditCost).toEqual({ orbs: 20_000 });
		expect(queuedCreditCost).toEqual(syncCreditCost);
	});

	test("a legacy batch track_tokens replays each item with the sync path's token deduction", async () => {
		const sync = await getTokenTrackParams({
			ctx: createCtx(),
			input: requestBody,
		});

		const [queuedMessage] = await captureQueuedMessages(() =>
			runBatchTrackTokens({ ctx: createCtx(), body: [requestBody] }),
		);
		replayedDeductions.length = 0;
		await runQueuedTrack({ ctx: createCtx(), ...queuedMessage });

		expect(replayedDeductions[0]).toEqual(sync.featureDeductions);
	});
});

afterAll(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
	mock.restore();
});
