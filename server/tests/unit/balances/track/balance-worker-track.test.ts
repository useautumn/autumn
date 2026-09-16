import { beforeEach, expect, test } from "bun:test";
import {
	type CustomerState,
	type CustomerStateMutation,
	computeTrack,
	createCustomerState,
	type OverageBehavior,
	type TrackCommand,
	type TrackDecision,
} from "@autumn/balance-engine";
import {
	type ApiBalanceV1,
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	ErrCode,
	InsufficientBalanceError,
	LATEST_VERSION,
	ResetInterval,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { trackParamsToTrackCommand } from "@/internal/balances/track/balanceWorker/balanceWorkerTrackRequest.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const trackIdentity = {
	orgId: "org",
	env: "sandbox",
	customerId: "customer",
} as const;

const execution = {
	decision: { kind: "new", mutation: trackMutation({}) } as TrackDecision,
	commands: [] as TrackCommand[],
	failure: undefined as Error | undefined,
};

await mockModuleWithRestore(
	"@/external/balanceWorker/getBalanceWorkerClient.js",
	clientModule,
);
await mockModuleWithRestore(
	"@/internal/customers/repos/getFullSubject/index.js",
	subjectModule,
);
await mockModuleWithRestore(
	"@/internal/balances/events/EventBatchingManager.js",
	eventsModule,
);
const { runBalanceWorkerTrack } = await import(
	"@/internal/balances/track/balanceWorker/runBalanceWorkerTrack.js"
);

test(
	"balance worker commands preserve request fields and defaults",
	commandContract,
);
beforeEach(resetExecution);
test("new and duplicate decisions return the API track shape", successContract);
test("responses read the committed mutation, not the request", outcomeContract);
test("worker decisions become existing API errors", errorContract);
test("track responses respect the requested API version", versionContract);
test("transport failures propagate without retry", failureContract);

function resetExecution(): void {
	execution.decision = { kind: "new", mutation: trackMutation({}) };
	execution.commands.length = 0;
	execution.failure = undefined;
}

function clientModule() {
	return { getBalanceWorkerClient: getClient };
}

function getClient() {
	return { track };
}

async function track({
	command,
}: {
	command: TrackCommand;
}): Promise<TrackDecision> {
	execution.commands.push(command);
	if (execution.failure) throw execution.failure;
	return execution.decision;
}

function subjectModule() {
	return { getFullSubjectNormalized: unexpectedServerWork };
}

function eventsModule() {
	return { globalEventBatchingManager: { addEvent: unexpectedServerWork } };
}

function unexpectedServerWork(): never {
	throw new Error(
		"Worker tracking must not read customer balances or insert events",
	);
}

function commandContract() {
	const { ctx, body } = fixture();
	expect(trackParamsToTrackCommand({ ctx, body })).toEqual({
		schemaVersion: 1,
		type: "track",
		commandId: "request",
		requestId: "request",
		identity: { orgId: "org", env: "sandbox", customerId: "customer" },
		entityId: null,
		featureId: "messages",
		value: 3,
		overageBehavior: "cap",
		properties: null,
		occurredAt: 1000,
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
		entityId: "entity",
		properties: { model: "model" },
		overageBehavior: "reject",
		occurredAt: 500,
	});
	for (const value of [0, -1]) {
		expect(
			trackParamsToTrackCommand({ ctx, body: { ...body, value } }).value,
		).toBe(value);
	}
}

async function successContract() {
	const { ctx, body } = fixture();
	const mutation = trackMutation({});
	for (const kind of ["new", "duplicate"] as const) {
		execution.decision = { kind, mutation };
		expect(await runBalanceWorkerTrack({ ctx, body })).toEqual({
			customer_id: "customer",
			entity_id: undefined,
			value: 3,
			balance: expectedBalance({ remaining: 7, usage: 3 }),
		});
		expect(execution.commands.at(-1)).toEqual(
			trackParamsToTrackCommand({ ctx, body }),
		);
	}
	expect(execution.commands).toHaveLength(2);
}

async function outcomeContract() {
	const { ctx, body } = fixture();
	// Capping at an exhausted, then a partial, balance: the reply is the snapshot.
	for (const [balance, usage, remaining, committedUsage] of [
		[0, 13, 0, 13],
		[2, 13, 0, 15],
	] as const) {
		execution.decision = {
			kind: "new",
			mutation: trackMutation({ state: customerState({ balance, usage }) }),
		};
		expect(await runBalanceWorkerTrack({ ctx, body })).toEqual({
			customer_id: "customer",
			entity_id: undefined,
			value: 3,
			balance: expectedBalance({ remaining, usage: committedUsage }),
		});
	}
	execution.decision = {
		kind: "new",
		mutation: echoedElsewhere({ mutation: trackMutation({}) }),
	};
	expect(await runBalanceWorkerTrack({ ctx, body })).toEqual({
		customer_id: "receipt-customer",
		entity_id: "entity",
		value: 3,
		balance: expectedBalance({ remaining: 7, usage: 3 }),
	});
}

async function errorContract() {
	const { ctx, body } = fixture();
	const rejected = trackMutation({
		state: customerState({ balance: 2, usage: 13 }),
		overageBehavior: "reject",
	});
	for (const kind of ["new", "duplicate"] as const) {
		execution.decision = { kind, mutation: rejected };
		await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toBeInstanceOf(
			InsufficientBalanceError,
		);
		await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toMatchObject({
			code: "insufficient_balance",
			statusCode: 400,
		});
	}
	for (const [reason, code, statusCode] of [
		["feature_not_found", ErrCode.InvalidRequest, 400],
		["command_conflict", ErrCode.DuplicateIdempotencyKey, 409],
	] as const) {
		execution.decision = { kind: "unsupported", reason };
		await expect(runBalanceWorkerTrack({ ctx, body })).rejects.toMatchObject({
			code,
			statusCode,
		});
	}
}

async function versionContract() {
	const { ctx, body } = fixture();
	ctx.apiVersion = new ApiVersionClass(ApiVersion.V2_0);
	expect(await runBalanceWorkerTrack({ ctx, body })).toMatchObject({
		customer_id: "customer",
		entity_id: undefined,
		event_name: undefined,
		value: 3,
		balance: {
			feature_id: "messages",
			granted_balance: 100,
			current_balance: 7,
			usage: 3,
			plan_id: "pro",
			reset: { interval: "month", resets_at: 1_800_000_000_000 },
		},
		balances: undefined,
	});
	ctx.apiVersion = new ApiVersionClass(ApiVersion.V1_Beta);
	expect<unknown>(await runBalanceWorkerTrack({ ctx, body })).toEqual({
		id: "placeholder",
		code: "event_received",
		customer_id: "customer",
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

function fixture() {
	const ctx = {
		id: "request",
		timestamp: 1000,
		org: { id: "org" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
	} as AutumnContext;
	const body: TrackParams = {
		customer_id: "customer",
		feature_id: "messages",
		value: 3,
	};
	return { ctx, body };
}

function customerState({
	balance,
	usage,
}: {
	balance: number;
	usage: number;
}): CustomerState {
	return createCustomerState({
		identity: trackIdentity,
		customerEntitlements: [
			{
				id: "balance",
				externalId: "messages-grant",
				featureId: "messages",
				balance,
				usage,
				granted: 100,
				planId: "pro",
				reset: {
					interval: "month",
					intervalCount: 1,
					nextResetAt: 1_800_000_000_000,
				},
				expiresAt: null,
			},
		],
	});
}

function trackMutation({
	state = customerState({ balance: 10, usage: 0 }),
	overageBehavior = "cap",
}: {
	state?: CustomerState;
	overageBehavior?: OverageBehavior;
}): CustomerStateMutation {
	const command: TrackCommand = {
		schemaVersion: 1,
		type: "track",
		commandId: "request",
		requestId: "request",
		identity: trackIdentity,
		entityId: null,
		featureId: "messages",
		value: 3,
		overageBehavior,
		properties: null,
		occurredAt: 1000,
	};
	const decision = computeTrack({
		state,
		command,
		deduplicationExpiresAt: 10_000,
	});
	if (decision.kind !== "new")
		throw new Error(`Expected a new track mutation, got ${decision.kind}`);
	return decision.mutation;
}

/** The engine refuses entity tracks today, so the echo is patched onto a computed mutation. */
function echoedElsewhere({
	mutation,
}: {
	mutation: CustomerStateMutation;
}): CustomerStateMutation {
	if (mutation.command.type !== "track")
		throw new Error("Expected a track mutation");
	return {
		...mutation,
		identity: { ...trackIdentity, customerId: "receipt-customer" },
		command: { ...mutation.command, entityId: "entity" },
	};
}

function expectedBalance({
	remaining,
	usage,
}: {
	remaining: number;
	usage: number;
}): ApiBalanceV1 {
	return {
		object: "balance",
		feature_id: "messages",
		granted: 100,
		remaining,
		usage,
		unlimited: false,
		overage_allowed: false,
		max_purchase: null,
		next_reset_at: 1_800_000_000_000,
		breakdown: [
			{
				object: "balance_breakdown",
				id: "messages-grant",
				plan_id: "pro",
				included_grant: 100,
				prepaid_grant: 0,
				remaining,
				usage,
				unlimited: false,
				reset: {
					interval: ResetInterval.Month,
					interval_count: undefined,
					resets_at: 1_800_000_000_000,
				},
				price: null,
				expires_at: null,
				overage: 0,
			},
		],
	};
}
