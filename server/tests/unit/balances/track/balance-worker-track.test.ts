import { beforeEach, expect, spyOn, test } from "bun:test";
import {
	applyMutation,
	catalogRowsToCatalog,
	computeTrack,
	type OverageBehavior,
	orgToCommandOrg,
	subjectStateToFullSubject,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	ApiVersion,
	ApiVersionClass,
	ErrCode,
	type FullSubject,
	fullSubjectToFullCustomer,
	getApiBalance,
	InsufficientBalanceError,
	ResetInterval,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import {
	fullSubjectToCatalogRows,
	fullSubjectToSubjectState,
} from "@/internal/balances/balanceWorker/fullSubjectToSubjectState.js";
import { trackParamsToTrackCommand } from "@/internal/balances/track/balanceWorker/balanceWorkerTrackRequest.js";
import * as claimKey from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import * as releaseKey from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

const execution = {
	reply: undefined as TrackReply | undefined,
	commands: [] as TrackCommand[],
	failure: undefined as Error | undefined,
	postgresResponse: undefined as TrackResponseV3 | undefined,
	/** The Postgres lane's steps in the order they ran: evict, read, postgres, evict. */
	postgresLane: [] as string[],
	postgresBodies: [] as TrackParams[],
	fullSubject: undefined as FullSubject | undefined,
};

await mockModuleWithRestore(
	"@/external/balanceWorker/getBalanceWorkerClient.js",
	clientModule,
);
await mockModuleWithRestore(
	"@/internal/balances/events/EventBatchingManager.js",
	eventsModule,
);
await mockModuleWithRestore(
	"@/internal/customers/repos/getFullSubject/index.js",
	fullSubjectModule,
);
await mockModuleWithRestore(
	"@/internal/balances/track/v3/runPostgresTrackV3.js",
	postgresTrackModule,
);
const { runBalanceWorkerTrack } = await import(
	"@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js"
);

test(
	"balance worker commands preserve request fields and defaults",
	commandContract,
);
beforeEach(resetExecution);
test("new and duplicate replies return the API track shape", successContract);
test("responses read the committed row, not the request", outcomeContract);
test("worker refusals become existing API errors", errorContract);
test(
	"a feature the customer holds no grant for answers 200 with no balance, as legacy does",
	unheldFeatureContract,
);
test(
	"an event name records its one usage event on the first feature only",
	eventNameContract,
);
test("track responses respect the requested API version", versionContract);
test("transport failures propagate without retry", failureContract);
test(
	"the body idempotency key is claimed like the Redis lane: kept on success and 409, released on 503",
	claimContract,
);
test(
	"a paid allocated refusal is tracked on Postgres and answered in the same shape",
	paidAllocatedContract,
);

function resetExecution(): void {
	execution.reply = undefined;
	execution.commands.length = 0;
	execution.failure = undefined;
	execution.postgresResponse = undefined;
	execution.postgresLane.length = 0;
	execution.postgresBodies.length = 0;
	execution.fullSubject = undefined;
}

function clientModule() {
	return { getBalanceWorkerClient: getClient };
}

function getClient() {
	return { track, evict };
}

async function evict(): Promise<{ evicted: boolean }> {
	execution.postgresLane.push("evict");
	return { evicted: true };
}

function fullSubjectModule() {
	return {
		getFullSubject: async () => {
			execution.postgresLane.push("read");
			return execution.fullSubject;
		},
	};
}

function postgresTrackModule() {
	return {
		runPostgresTrackV3: async ({ body }: { body: TrackParams }) => {
			execution.postgresLane.push("postgres");
			execution.postgresBodies.push(body);
			if (!execution.postgresResponse)
				throw new Error("No Postgres response staged");
			return execution.postgresResponse;
		},
	};
}

async function track({
	command,
}: {
	command: TrackCommand;
}): Promise<TrackReply> {
	execution.commands.push(command);
	if (execution.failure) throw execution.failure;
	if (!execution.reply) throw new Error("No reply staged");
	return execution.reply;
}

function eventsModule() {
	return { globalEventBatchingManager: { addEvent: unexpectedServerWork } };
}

function unexpectedServerWork(): never {
	throw new Error("Worker tracking must not insert events");
}

/** One customer with a 100 grant, adjustment 10 and balance 72; tracks of 3 read against it. */
function fixture({ balance = 72 }: { balance?: number } = {}) {
	const customer = createCustomerFixture();
	customer.customerEntitlement.balance = balance;
	const { ctx, fullSubject } = customer;
	const body: TrackParams = {
		customer_id: fullSubject.customerId,
		feature_id: "messages",
		value: 3,
	};
	return { ...customer, ctx, body };
}

function commandContract() {
	const { ctx, body } = fixture();
	expect(trackParamsToTrackCommand({ ctx, body })).toEqual({
		schemaVersion: 1,
		type: "track",
		commandId: ctx.id,
		requestId: ctx.id,
		identity: {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: "cus_test",
			entityId: null,
		},
		org: orgToCommandOrg({ org: ctx.org }),
		featureId: "messages",
		internalFeatureId: fixture().feature.internal_id,
		value: 3,
		overageBehavior: "cap",
		properties: null,
		usageEvent: { name: "messages", idempotencyKey: null, id: null },
		occurredAt: ctx.timestamp,
	});
	expect(
		trackParamsToTrackCommand({ ctx, body: { ...body, value: undefined } })
			.value,
	).toBe(1);
	const retryBody: TrackParams = {
		...body,
		idempotency_key: "stable",
		timestamp: 500,
		entity_id: "entity",
		properties: { model: "model" },
		overage_behavior: "reject",
	};
	const first = trackParamsToTrackCommand({ ctx, body: retryBody });
	const retry = trackParamsToTrackCommand({
		ctx: { ...ctx, id: "retry" },
		body: retryBody,
	});
	expect(retry).toEqual({ ...first, requestId: "retry" });
	expect(first).toMatchObject({
		commandId: JSON.stringify(["track", "stable"]),
		identity: { entityId: "entity" },
		properties: { model: "model" },
		overageBehavior: "reject",
		occurredAt: 500,
		// The event row carries the caller's key as sent, as legacy's does.
		usageEvent: { name: "messages", idempotencyKey: "stable", id: null },
	});
	expect(
		trackParamsToTrackCommand({
			ctx: { ...ctx, testOptions: { eventId: "evt_caller" } },
			body,
		}).usageEvent,
	).toEqual({ name: "messages", idempotencyKey: null, id: "evt_caller" });
	for (const value of [0, -1]) {
		expect(
			trackParamsToTrackCommand({ ctx, body: { ...body, value } }).value,
		).toBe(value);
	}
}

async function successContract() {
	const customer = fixture();
	const { ctx, body } = customer;
	for (const duplicate of [false, true]) {
		execution.reply = trackReplyOf({ customer, duplicate });
		expect(await runBalanceWorkerTrack({ ctx, body })).toEqual({
			customer_id: "cus_test",
			entity_id: undefined,
			value: 3,
			balance: expectedBalance({ customer, balance: 69 }),
			deductions: [
				{
					balance_id: "messages_grant",
					feature_id: "messages",
					plan_id: "pro",
					reset: {
						interval: ResetInterval.Month,
						resets_at: 1_800_000_000_000,
					},
					value: 3,
				},
			],
		});
		expect(execution.commands.at(-1)).toEqual(
			trackParamsToTrackCommand({ ctx, body }),
		);
	}
	expect(execution.commands).toHaveLength(2);
}

async function outcomeContract() {
	// Capping at an exhausted, then a partial, balance: the reply is the row after the track.
	for (const [balance, remaining] of [
		[0, 0],
		[2, 0],
	] as const) {
		const customer = fixture({ balance });
		execution.reply = trackReplyOf({ customer });
		expect(
			await runBalanceWorkerTrack({
				ctx: customer.ctx,
				body: customer.body,
			}),
		).toEqual({
			customer_id: "cus_test",
			entity_id: undefined,
			value: 3,
			balance: expectedBalance({ customer, balance: remaining }),
			deductions:
				balance === 0
					? []
					: [
							{
								balance_id: "messages_grant",
								feature_id: "messages",
								plan_id: "pro",
								reset: {
									interval: ResetInterval.Month,
									resets_at: 1_800_000_000_000,
								},
								value: balance,
							},
						],
		});
	}
}

async function errorContract() {
	const customer = fixture({ balance: 2 });
	const { ctx, body } = customer;
	for (const duplicate of [false, true]) {
		execution.reply = trackReplyOf({
			customer,
			overageBehavior: "reject",
			duplicate,
		});
		await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toBeInstanceOf(
			InsufficientBalanceError,
		);
		await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toMatchObject({
			code: "insufficient_balance",
			statusCode: 400,
		});
	}
	for (const [workerCode, workerReason, code, statusCode] of [
		["UNSUPPORTED_COMMAND", "entity_not_found", ErrCode.InvalidRequest, 400],
		["COMMAND_CONFLICT", undefined, ErrCode.DuplicateIdempotencyKey, 409],
	] as const) {
		execution.failure = new BalanceWorkerClientError({
			code: "WORKER_ERROR",
			outcome: "not_submitted",
			message: "refused",
			workerCode,
			workerReason,
		});
		await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toMatchObject({
			code,
			statusCode,
		});
		execution.failure = undefined;
	}
}

/** The fixture customer, whose catalog also has a `words` feature it holds no grant for, both under event `chat`. */
function unheldFeatureFixture() {
	const customer = fixture();
	const { ctx, feature } = customer;
	ctx.features = [
		{ ...feature, event_names: ["chat"] },
		{
			...feature,
			id: "words",
			internal_id: "internal_words",
			event_names: ["chat"],
		},
	];
	return customer;
}

async function unheldFeatureContract() {
	const customer = unheldFeatureFixture();
	const { ctx } = customer;
	const body: TrackParams = { ...customer.body, feature_id: "words" };
	execution.reply = trackReplyOf({ customer, body });
	expect(execution.reply.result).toMatchObject({
		status: "applied",
		deltas: [],
		deductions: [],
	});
	expect(await runBalanceWorkerTrack({ ctx, body })).toEqual({
		customer_id: "cus_test",
		entity_id: undefined,
		value: 3,
		balance: null,
		deductions: [],
	});
}

async function eventNameContract() {
	const customer = unheldFeatureFixture();
	const { ctx } = customer;
	execution.reply = trackReplyOf({ customer });
	const body: TrackParams = {
		customer_id: "cus_test",
		event_name: "chat",
		value: 3,
	};
	await runBalanceWorkerTrack({ ctx, body });
	expect(
		execution.commands.map(({ featureId, usageEvent }) => ({
			featureId,
			usageEvent,
		})),
	).toEqual([
		{
			featureId: "messages",
			usageEvent: { name: "chat", idempotencyKey: null, id: null },
		},
		{ featureId: "words", usageEvent: null },
	]);
	expect(
		trackParamsToTrackCommand({
			ctx,
			body: { ...customer.body, skip_event: true },
		}).usageEvent,
	).toBeNull();
}

async function versionContract() {
	const customer = fixture();
	const { ctx, body } = customer;
	execution.reply = trackReplyOf({ customer });
	ctx.apiVersion = new ApiVersionClass(ApiVersion.V2_0);
	expect(await runBalanceWorkerTrack({ ctx, body })).toMatchObject({
		customer_id: "cus_test",
		entity_id: undefined,
		event_name: undefined,
		value: 3,
		balance: {
			feature_id: "messages",
			granted_balance: 110,
			current_balance: 69,
			usage: 41,
			plan_id: "pro",
			reset: { interval: "month", resets_at: 1_800_000_000_000 },
		},
		balances: undefined,
	});
	ctx.apiVersion = new ApiVersionClass(ApiVersion.V1_Beta);
	expect<unknown>(await runBalanceWorkerTrack({ ctx, body })).toEqual({
		id: "placeholder",
		code: "event_received",
		customer_id: "cus_test",
		entity_id: undefined,
		event_name: undefined,
		feature_id: "messages",
	});
}

async function failureContract() {
	const { ctx, body } = fixture();
	execution.failure = new Error("unknown committed result");
	await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toBe(
		execution.failure,
	);
	expect(execution.commands).toHaveLength(1);
}

/** What the worker replies for this customer's track: the logged result and the rows after it. A retry replies the same. */
function trackReplyOf({
	customer,
	body = customer.body,
	overageBehavior = "cap",
}: {
	customer: ReturnType<typeof fixture>;
	body?: TrackParams;
	overageBehavior?: OverageBehavior;
	duplicate?: boolean;
}): TrackReply {
	const { ctx, fullSubject } = customer;
	const featureIds = ["messages"];
	const state = fullSubjectToSubjectState({ ctx, fullSubject, featureIds });
	const catalog = catalogRowsToCatalog({
		rows: fullSubjectToCatalogRows({ ctx, fullSubject, featureIds }),
	});
	const command = trackParamsToTrackCommand({
		ctx,
		body: { ...body, overage_behavior: overageBehavior },
	});
	const mutation = computeTrack({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		command,
	});
	if (mutation.result.type !== "track") throw new Error("Expected a track");
	return {
		result: mutation.result,
		changes: mutation.changes,
		state: applyMutation({ state, mutation }),
		// The catalog the track was decided against, as the worker returns it.
		catalog,
	};
}

/** What the Redis path would answer for the same row at `balance`. */
function expectedBalance({
	customer,
	balance,
}: {
	customer: ReturnType<typeof fixture>;
	balance: number;
}) {
	return getApiBalance({
		ctx: { ...customer.ctx, expand: [] },
		fullCus: fullSubjectToFullCustomer({ fullSubject: customer.fullSubject }),
		cusEnts: [
			{
				...customer.customerEntitlement,
				customer_product: customer.customerProduct,
				balance,
			},
		],
		feature: customer.feature,
	}).data;
}

async function claimContract() {
	const customer = fixture();
	const { ctx } = customer;
	const claims: string[] = [];
	const releases: string[] = [];
	const claimSpy = spyOn(claimKey, "checkIdempotencyKey").mockImplementation(
		async ({ idempotencyKey }) => {
			claims.push(idempotencyKey);
		},
	);
	const releaseSpy = spyOn(
		releaseKey,
		"releaseIdempotencyKey",
	).mockImplementation(async ({ idempotencyKey }) => {
		releases.push(idempotencyKey);
	});
	try {
		execution.reply = trackReplyOf({ customer });
		await runBalanceWorkerTrack({ ctx, body: customer.body });
		expect(claims).toEqual([]);

		const body = { ...customer.body, idempotency_key: "key_1" };
		await runBalanceWorkerTrack({ ctx, body });
		expect(claims).toEqual(["track:key_1"]);
		expect(releases).toEqual([]);

		// May have applied: the claim goes so the retry reaches the worker's own dedup.
		execution.failure = new BalanceWorkerClientError({
			code: "DEADLINE",
			outcome: "unknown",
			message: "no confirmation",
		});
		await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toMatchObject({
			statusCode: 503,
		});
		expect(releases).toEqual(["track:key_1"]);

		execution.failure = new BalanceWorkerClientError({
			code: "WORKER_ERROR",
			outcome: "not_submitted",
			message: "already applied",
			workerCode: "DUPLICATE_COMMAND",
		});
		await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toMatchObject({
			statusCode: 409,
		});
		expect(releases).toEqual(["track:key_1"]);
		expect(claims).toEqual(["track:key_1", "track:key_1", "track:key_1"]);
	} finally {
		claimSpy.mockRestore();
		releaseSpy.mockRestore();
	}
}

async function paidAllocatedContract() {
	const customer = fixture();
	const { ctx, body } = customer;
	execution.failure = new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		outcome: "not_submitted",
		message: "Unsupported command: paid_allocated_not_supported",
		workerCode: "UNSUPPORTED_COMMAND",
		workerReason: "paid_allocated_not_supported",
	});
	execution.fullSubject = customer.fullSubject;
	const postgresBalance = expectedBalance({ customer, balance: 69 });
	const deductions = [
		{
			balance_id: "messages_grant",
			feature_id: "messages",
			plan_id: "pro",
			reset: { interval: ResetInterval.Month, resets_at: 1_800_000_000_000 },
			value: 3,
		},
	];
	execution.postgresResponse = {
		customer_id: body.customer_id,
		value: body.value ?? 1,
		balance: postgresBalance,
		deductions,
	};

	const response = await runBalanceWorkerTrack({ ctx, body });

	expect(response).toEqual({
		customer_id: "cus_test",
		entity_id: undefined,
		value: 3,
		balance: postgresBalance,
		deductions,
	});
	// The worker was asked once; Postgres ran this one feature between two evicts.
	expect(execution.commands).toHaveLength(1);
	expect(execution.postgresLane).toEqual([
		"evict",
		"read",
		"postgres",
		"evict",
	]);
	expect(execution.postgresBodies).toEqual([
		{ ...body, feature_id: "messages", skip_event: false },
	]);
}
