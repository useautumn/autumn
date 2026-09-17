import { beforeEach, expect, test } from "bun:test";
import {
	catalogRowsToCatalog,
	computeTrack,
	type OverageBehavior,
	type SubjectStateMutation,
	subjectStateToFullSubject,
	type TrackCommand,
	type TrackDecision,
} from "@autumn/balance-engine";
import {
	ApiVersion,
	ApiVersionClass,
	ErrCode,
	fullSubjectToFullCustomer,
	getApiBalance,
	InsufficientBalanceError,
	type TrackParams,
} from "@autumn/shared";
import {
	fullSubjectToCatalogRows,
	fullSubjectToSubjectState,
} from "@/internal/balances/balanceWorker/fullSubjectToSubjectState.js";
import { trackParamsToTrackCommand } from "@/internal/balances/track/balanceWorker/balanceWorkerTrackRequest.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

const execution = {
	decision: undefined as TrackDecision | undefined,
	commands: [] as TrackCommand[],
	failure: undefined as Error | undefined,
};

await mockModuleWithRestore(
	"@/external/balanceWorker/getBalanceWorkerClient.js",
	clientModule,
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
test("responses read the committed row, not the request", outcomeContract);
test("worker decisions become existing API errors", errorContract);
test("track responses respect the requested API version", versionContract);
test("transport failures propagate without retry", failureContract);

function resetExecution(): void {
	execution.decision = undefined;
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
	if (!execution.decision) throw new Error("No decision staged");
	return execution.decision;
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
	const loadSubject = async () => fullSubject;
	return { ...customer, ctx, body, loadSubject };
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
		featureId: "messages",
		value: 3,
		overageBehavior: "cap",
		properties: null,
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
	});
	for (const value of [0, -1]) {
		expect(
			trackParamsToTrackCommand({ ctx, body: { ...body, value } }).value,
		).toBe(value);
	}
}

async function successContract() {
	const customer = fixture();
	const { ctx, body, loadSubject } = customer;
	const mutation = trackMutation({ customer });
	for (const kind of ["new", "duplicate"] as const) {
		execution.decision = { kind, mutation };
		expect(await runBalanceWorkerTrack({ ctx, body, loadSubject })).toEqual({
			customer_id: "cus_test",
			entity_id: undefined,
			value: 3,
			balance: expectedBalance({ customer, balance: 69 }),
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
		execution.decision = {
			kind: "new",
			mutation: trackMutation({ customer }),
		};
		expect(
			await runBalanceWorkerTrack({
				ctx: customer.ctx,
				body: customer.body,
				loadSubject: customer.loadSubject,
			}),
		).toEqual({
			customer_id: "cus_test",
			entity_id: undefined,
			value: 3,
			balance: expectedBalance({ customer, balance: remaining }),
		});
	}
	const customer = fixture();
	execution.decision = {
		kind: "new",
		mutation: echoedElsewhere({ mutation: trackMutation({ customer }) }),
	};
	expect(
		await runBalanceWorkerTrack({
			ctx: customer.ctx,
			body: customer.body,
			loadSubject: customer.loadSubject,
		}),
	).toMatchObject({
		customer_id: "receipt-customer",
		entity_id: "entity",
		value: 3,
	});
}

async function errorContract() {
	const customer = fixture({ balance: 2 });
	const { ctx, body, loadSubject } = customer;
	const rejected = trackMutation({ customer, overageBehavior: "reject" });
	for (const kind of ["new", "duplicate"] as const) {
		execution.decision = { kind, mutation: rejected };
		await expect(
			runBalanceWorkerTrack({ ctx, body, loadSubject }),
		).rejects.toBeInstanceOf(InsufficientBalanceError);
		await expect(
			runBalanceWorkerTrack({ ctx, body, loadSubject }),
		).rejects.toMatchObject({ code: "insufficient_balance", statusCode: 400 });
	}
	for (const [reason, code, statusCode] of [
		["feature_not_found", ErrCode.InvalidRequest, 400],
		["command_conflict", ErrCode.DuplicateIdempotencyKey, 409],
	] as const) {
		execution.decision = { kind: "unsupported", reason };
		await expect(
			runBalanceWorkerTrack({ ctx, body, loadSubject }),
		).rejects.toMatchObject({ code, statusCode });
	}
}

async function versionContract() {
	const customer = fixture();
	const { ctx, body, loadSubject } = customer;
	execution.decision = { kind: "new", mutation: trackMutation({ customer }) };
	ctx.apiVersion = new ApiVersionClass(ApiVersion.V2_0);
	expect(await runBalanceWorkerTrack({ ctx, body, loadSubject })).toMatchObject(
		{
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
		},
	);
	ctx.apiVersion = new ApiVersionClass(ApiVersion.V1_Beta);
	expect<unknown>(
		await runBalanceWorkerTrack({ ctx, body, loadSubject }),
	).toEqual({
		id: "placeholder",
		code: "event_received",
		customer_id: "cus_test",
		entity_id: undefined,
		event_name: undefined,
		feature_id: "messages",
	});
}

async function failureContract() {
	const { ctx, body, loadSubject } = fixture();
	execution.failure = new Error("unknown committed result");
	await expect(runBalanceWorkerTrack({ ctx, body, loadSubject })).rejects.toBe(
		execution.failure,
	);
	expect(execution.commands).toHaveLength(1);
}

function trackMutation({
	customer,
	overageBehavior = "cap",
}: {
	customer: ReturnType<typeof fixture>;
	overageBehavior?: OverageBehavior;
}): SubjectStateMutation {
	const { ctx, fullSubject } = customer;
	const featureIds = ["messages"];
	const state = fullSubjectToSubjectState({ ctx, fullSubject, featureIds });
	const catalog = catalogRowsToCatalog({
		rows: fullSubjectToCatalogRows({ ctx, fullSubject, featureIds }),
	});
	const command = trackParamsToTrackCommand({
		ctx,
		body: { ...customer.body, overage_behavior: overageBehavior },
	});
	const decision = computeTrack({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		command,
		deduplicationExpiresAt: ctx.timestamp + 10_000,
	});
	if (decision.kind !== "new")
		throw new Error(`Expected a new track mutation, got ${decision.kind}`);
	return decision.mutation;
}

/** The engine refuses entity tracks today, so the echo is patched onto a computed mutation. */
function echoedElsewhere({
	mutation,
}: {
	mutation: SubjectStateMutation;
}): SubjectStateMutation {
	return {
		...mutation,
		identity: {
			...mutation.identity,
			customerId: "receipt-customer",
			entityId: "entity",
		},
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
