import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeFinalize,
	computeTrack,
	createSubjectState,
	type SubjectState,
	type SubjectStateMutation,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { ResetInterval } from "@autumn/shared";
import { customerWith } from "../../../balance-engine/tests/unit/deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	occurredAt,
} from "../../../balance-engine/tests/unit/engineFixtures.js";
import { subjectsToBalanceWebhooks } from "../../src/balanceWebhooks.js";

/** Which webhooks one mutation calls for, decided from the subject as it found it and as it left it. */

const stateWith = ({
	balance,
	customer,
}: {
	balance: number;
	customer?: Parameters<typeof createSubjectState>[0]["customer"];
}): SubjectState =>
	createSubjectState({
		identity,
		customer,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [createCustomerEntitlement({ balance })],
	});

const subjectOf = ({ state }: { state: SubjectState }) =>
	subjectStateToFullSubject({ state, catalog: createCatalogFor({ state }) });

/** What the worker hands the decision: the mutation with the subject as it found it and as it left it. */
const decidedOn = ({
	state,
	mutation,
}: {
	state: SubjectState;
	mutation: SubjectStateMutation;
}) => ({
	mutation,
	before: subjectOf({ state }),
	after: subjectOf({ state: applyMutation({ state, mutation }) }),
});

const webhooksOf = ({
	state,
	mutation,
}: {
	state: SubjectState;
	mutation: SubjectStateMutation;
}) => subjectsToBalanceWebhooks(decidedOn({ state, mutation }));

/** Tracks `value` against an allowance of `balance`. */
const trackOn = ({
	balance,
	value,
	overageBehavior = "cap" as const,
}: {
	balance: number;
	value: number;
	overageBehavior?: "cap" | "reject";
}): { state: SubjectState; mutation: SubjectStateMutation } => {
	const state = stateWith({ balance });
	const mutation = computeTrack({
		fullSubject: subjectOf({ state }),
		command: createTrackCommand({ value, overageBehavior }),
	});
	return { state, mutation };
};

describe("limit reached", () => {
	test("a track that empties the allowance fires, naming the customer, the feature and the limit", () => {
		const webhooks = webhooksOf(trackOn({ balance: 10, value: 10 }));

		expect(webhooks).toEqual([
			{
				type: "balance_webhook",
				eventType: "balances.limit_reached",
				data: {
					customer_id: identity.customerId,
					feature_id: "messages",
					limit_type: "included",
				},
				tags: [`customer_id.${identity.customerId}`],
			},
		]);
	});

	test("a track that leaves some allowance does not fire", () => {
		expect(webhooksOf(trackOn({ balance: 10, value: 3 }))).toEqual([]);
	});

	test("a track on an allowance that was already empty does not fire again", () => {
		expect(webhooksOf(trackOn({ balance: 0, value: 1 }))).toEqual([]);
	});

	test("a refused track moved nothing, so nothing fires", () => {
		expect(
			webhooksOf(
				trackOn({
					balance: 3,
					value: 5,
					overageBehavior: "reject",
				}),
			),
		).toEqual([]);
	});

	test("a lock that empties the allowance fires, and settling it fires nothing more", () => {
		const state = stateWith({ balance: 8 });
		const lockMutation = computeTrack({
			fullSubject: subjectOf({ state }),
			command: {
				...createTrackCommand({ value: 8, commandId: "cmd_lock" }),
				lock: {
					id: "lck_1",
					lockId: "L1",
					expiresAt: occurredAt + 86_400_000,
					expiryAction: "confirm",
				},
			},
		});
		const lockChange = lockMutation.changes.find(
			(change) => change.table === "locks" && change.op === "insert",
		);
		if (lockChange?.table !== "locks" || lockChange.op !== "insert")
			throw new Error("Expected the track to open a lock");
		const locked = applyMutation({ state, mutation: lockMutation });
		const finalizeMutation = computeFinalize({
			fullSubject: subjectOf({ state: locked }),
			command: {
				schemaVersion: 1,
				type: "finalize",
				commandId: "cmd_finalize",
				requestId: "req_finalize",
				identity,
				occurredAt,
				org: createTrackCommand().org,
				lock: lockChange.row,
				internalFeatureId: "feat_messages",
				finalValue: null,
				properties: null,
			},
		});

		const onLock = webhooksOf({ state, mutation: lockMutation });
		const onFinalize = webhooksOf({
			state: locked,
			mutation: finalizeMutation,
		});

		expect(onLock.map(({ eventType }) => eventType)).toEqual([
			"balances.limit_reached",
		]);
		expect(onFinalize).toEqual([]);
	});

	test("releasing a lock that had emptied the allowance fires nothing: the balance came back", () => {
		const state = stateWith({ balance: 8 });
		const lockMutation = computeTrack({
			fullSubject: subjectOf({ state }),
			command: {
				...createTrackCommand({ value: 8, commandId: "cmd_lock" }),
				lock: {
					id: "lck_1",
					lockId: "L1",
					expiresAt: occurredAt + 86_400_000,
					expiryAction: "confirm",
				},
			},
		});
		const lockChange = lockMutation.changes.find(
			(change) => change.table === "locks" && change.op === "insert",
		);
		if (lockChange?.table !== "locks" || lockChange.op !== "insert")
			throw new Error("Expected the track to open a lock");
		const locked = applyMutation({ state, mutation: lockMutation });
		const release = computeFinalize({
			fullSubject: subjectOf({ state: locked }),
			command: {
				schemaVersion: 1,
				type: "finalize",
				commandId: "cmd_release",
				requestId: "req_release",
				identity,
				occurredAt,
				org: createTrackCommand().org,
				lock: lockChange.row,
				internalFeatureId: "feat_messages",
				finalValue: 0,
				properties: null,
			},
		});

		expect(webhooksOf({ state: locked, mutation: release })).toEqual([]);
	});

	test("a track that spends a daily cap names the cap, its window and the usage in it", () => {
		const state = stateWith({
			balance: 100,
			customer: customerWith({
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 5,
						interval: ResetInterval.Day,
					},
				],
			}),
		});
		const mutation = computeTrack({
			fullSubject: subjectOf({ state }),
			command: createTrackCommand({ value: 5, overageBehavior: "cap" }),
		});

		const [webhook] = webhooksOf({ state, mutation });

		expect(webhook?.data).toMatchObject({
			feature_id: "messages",
			limit_type: "usage_limit",
			usage_limit: { limit: 5, interval: "day", usage: 5, remaining: 0 },
		});
		expect(webhook?.data).not.toHaveProperty("filter");
	});

	test("a filtered cap echoes its filter", () => {
		const state = stateWith({
			balance: 100,
			customer: customerWith({
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 2,
						interval: ResetInterval.Day,
						filter: { properties: { model: "gpt" } },
					},
				],
			}),
		});
		const mutation = computeTrack({
			fullSubject: subjectOf({ state }),
			command: {
				...createTrackCommand({ value: 2, overageBehavior: "cap" }),
				properties: { model: "gpt" },
			},
		});

		const [webhook] = webhooksOf({ state, mutation });

		expect(webhook?.data).toMatchObject({
			limit_type: "usage_limit",
			filter: { properties: { model: "gpt" } },
		});
	});
});
