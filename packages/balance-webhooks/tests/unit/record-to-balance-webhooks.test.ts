import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeFinalize,
	computeTrack,
	createSubjectState,
	type MutationRecord,
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
import { recordToBalanceWebhooks } from "../../src/balanceWebhooks.js";

/** Which webhooks one record of the balance log calls for, decided from the record alone. */

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

/** What the writer puts on the log: the mutation, its receipt, and the subject as the mutation left it. */
const logged = ({
	state,
	mutation,
}: {
	state: SubjectState;
	mutation: SubjectStateMutation;
}): MutationRecord => {
	const after = applyMutation({ state, mutation });
	return {
		...mutation,
		receipt: { fingerprint: "f", expiresAt: 1 },
		after: { state: after, catalog: createCatalogFor({ state: after }) },
	};
};

const trackRecord = ({
	balance,
	value,
	overageBehavior = "cap" as const,
}: {
	balance: number;
	value: number;
	overageBehavior?: "cap" | "reject";
}): MutationRecord => {
	const state = stateWith({ balance });
	const mutation = computeTrack({
		fullSubject: subjectOf({ state }),
		command: createTrackCommand({ value, overageBehavior }),
	});
	return logged({ state, mutation });
};

describe("limit reached", () => {
	test("a track that empties the allowance fires, naming the customer, the feature and the limit", () => {
		const webhooks = recordToBalanceWebhooks({
			record: trackRecord({ balance: 10, value: 10 }),
		});

		expect(webhooks).toEqual([
			{
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
		expect(
			recordToBalanceWebhooks({
				record: trackRecord({ balance: 10, value: 3 }),
			}),
		).toEqual([]);
	});

	test("a track on an allowance that was already empty does not fire again", () => {
		expect(
			recordToBalanceWebhooks({
				record: trackRecord({ balance: 0, value: 1 }),
			}),
		).toEqual([]);
	});

	test("a refused track moved nothing, so nothing fires", () => {
		expect(
			recordToBalanceWebhooks({
				record: trackRecord({
					balance: 3,
					value: 5,
					overageBehavior: "reject",
				}),
			}),
		).toEqual([]);
	});

	test("a record from before the log carried the subject is skipped", () => {
		const { after: _after, ...older } = trackRecord({ balance: 10, value: 10 });

		expect(recordToBalanceWebhooks({ record: older })).toEqual([]);
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

		const onLock = recordToBalanceWebhooks({
			record: logged({ state, mutation: lockMutation }),
		});
		const onFinalize = recordToBalanceWebhooks({
			record: logged({ state: locked, mutation: finalizeMutation }),
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

		expect(
			recordToBalanceWebhooks({
				record: logged({ state: locked, mutation: release }),
			}),
		).toEqual([]);
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

		const [webhook] = recordToBalanceWebhooks({
			record: logged({ state, mutation }),
		});

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

		const [webhook] = recordToBalanceWebhooks({
			record: logged({ state, mutation }),
		});

		expect(webhook?.data).toMatchObject({
			limit_type: "usage_limit",
			filter: { properties: { model: "gpt" } },
		});
	});
});
