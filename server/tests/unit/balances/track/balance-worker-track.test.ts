import { beforeEach, expect, test } from "bun:test";
import type {
	TrackCommand,
	TrackDecision,
	TrackOutcome,
} from "@autumn/balance-engine";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	ErrCode,
	InsufficientBalanceError,
	LATEST_VERSION,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { trackParamsToTrackCommand } from "@/internal/balances/track/balanceWorker/balanceWorkerTrackRequest.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const execution = {
	decision: { kind: "new", outcome: trackOutcome() } as TrackDecision,
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
test(
	"capped, zero-mutation and entity responses use only the outcome",
	outcomeContract,
);
test("worker decisions become existing API errors", errorContract);
test("track responses respect the requested API version", versionContract);
test("transport failures propagate without retry", failureContract);

function resetExecution(): void {
	execution.decision = { kind: "new", outcome: trackOutcome() };
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
	const outcome = trackOutcome();
	for (const kind of ["new", "duplicate"] as const) {
		execution.decision = { kind, outcome };
		expect(await runBalanceWorkerTrack({ ctx, body })).toEqual({
			customer_id: "customer",
			entity_id: undefined,
			value: 3,
			balance: null,
		});
		expect(execution.commands.at(-1)).toEqual(
			trackParamsToTrackCommand({ ctx, body }),
		);
	}
	expect(execution.commands).toHaveLength(2);
}

async function outcomeContract() {
	const { ctx, body } = fixture();
	for (const appliedValue of [0, 1]) {
		execution.decision = {
			kind: "new",
			outcome: {
				...trackOutcome(),
				identity: {
					orgId: "org",
					env: "sandbox",
					customerId: "receipt-customer",
				},
				entityId: "entity",
				appliedValue,
				balanceAfter: 10 - appliedValue,
				mutations: [],
			},
		};
		expect(await runBalanceWorkerTrack({ ctx, body })).toEqual({
			customer_id: "receipt-customer",
			entity_id: "entity",
			value: 3,
			balance: null,
		});
	}
}

async function errorContract() {
	const { ctx, body } = fixture();
	for (const kind of ["new", "duplicate"] as const) {
		execution.decision = {
			kind,
			outcome: {
				...trackOutcome(),
				status: "rejected",
				reason: "insufficient_balance",
				appliedValue: 0,
				mutations: [],
			},
		};
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
	expect(await runBalanceWorkerTrack({ ctx, body })).toEqual({
		customer_id: "customer",
		entity_id: undefined,
		event_name: undefined,
		value: 3,
		balance: null,
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

function trackOutcome(): TrackOutcome {
	return {
		schemaVersion: 1,
		type: "track_outcome",
		commandId: "request",
		commandFingerprint: "fingerprint",
		requestId: "request",
		identity: { orgId: "org", env: "sandbox", customerId: "customer" },
		entityId: null,
		featureId: "messages",
		requestedValue: 3,
		appliedValue: 3,
		overageBehavior: "cap",
		properties: null,
		status: "applied",
		reason: null,
		balanceBefore: 10,
		balanceAfter: 7,
		revisionBefore: 0,
		revisionAfter: 1,
		occurredAt: 1000,
		deduplicationExpiresAt: 10000,
		mutations: [
			{
				customerEntitlementId: "balance",
				balanceBefore: 10,
				balanceAfter: 7,
				usageBefore: 0,
				usageAfter: 3,
			},
		],
	};
}
