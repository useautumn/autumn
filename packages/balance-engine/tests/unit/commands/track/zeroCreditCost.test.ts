import { describe, expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import {
	applyMutation,
	computeCheck,
	computeFinalize,
	computeTrack,
	createSubjectState,
	type SubjectState,
	subjectStateToFullSubject,
	type WorkerCustomerEntitlement,
	type WorkerFullSubject,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCheckCommand,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	occurredAt,
	org,
	trackResultOf,
} from "../../engineFixtures.js";

const messagesSchema = ({ creditAmount }: { creditAmount: number }) => [
	{
		metered_feature_id: "messages",
		feature_amount: 1,
		credit_amount: creditAmount,
	},
];

/**
 * The catalog prices messages at `creditAmount` credits (free by default); a
 * plan item's feature_override, when given, replaces that schema for the row.
 */
const freeCreditSubject = ({
	state,
	creditAmount = 0,
	overrideCreditAmount,
}: {
	state: SubjectState;
	creditAmount?: number;
	overrideCreditAmount?: number;
}): WorkerFullSubject => {
	const catalog = createCatalogFor({ state });
	const credits = catalog.features.feat_credits;
	if (!credits) throw new Error("credits feature row missing");
	credits.type = FeatureType.CreditSystem;
	credits.config = { schema: messagesSchema({ creditAmount }) };
	if (overrideCreditAmount !== undefined) {
		for (const entitlement of Object.values(catalog.entitlements)) {
			entitlement.feature_override = {
				schema: messagesSchema({ creditAmount: overrideCreditAmount }),
			};
		}
	}
	return subjectStateToFullSubject({ state, catalog });
};

const creditState = ({
	balance,
	extra = {},
}: {
	balance: number;
	extra?: Partial<WorkerCustomerEntitlement>;
}) =>
	createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			{
				...createCustomerEntitlement({
					id: "credits_row",
					featureId: "credits",
					balance,
				}),
				...extra,
			},
		],
	});

const lockInsertOf = (mutation: ReturnType<typeof computeTrack>) => {
	const lockChange = mutation.changes.find(
		(change) => change.table === "locks" && change.op === "insert",
	);
	if (lockChange?.table !== "locks" || lockChange.op !== "insert")
		throw new Error("Expected the track to open a lock");
	return lockChange.row;
};

describe("zero credit cost", () => {
	test.concurrent(
		"a track of a free feature leaves the credit balance untouched",
		() => {
			const state = creditState({ balance: 300 });
			const mutation = computeTrack({
				fullSubject: freeCreditSubject({ state }),
				command: createTrackCommand({ value: 1, overageBehavior: "cap" }),
			});

			expect(trackResultOf({ mutation })).toMatchObject({
				status: "applied",
				fundingFeatureId: "credits",
				fundingCreditCost: 0,
				deductions: [],
			});
			expect(
				applyMutation({ state, mutation }).customerEntitlements[0]?.balance,
			).toBe(300);
		},
	);

	test.concurrent(
		"a free feature is never rejected, even with no credits left",
		() => {
			const state = creditState({ balance: 0 });
			const mutation = computeTrack({
				fullSubject: freeCreditSubject({ state }),
				command: createTrackCommand({ value: 4, overageBehavior: "reject" }),
			});

			expect(trackResultOf({ mutation })).toMatchObject({
				status: "applied",
			});
			expect(
				applyMutation({ state, mutation }).customerEntitlements[0]?.balance,
			).toBe(0);
		},
	);

	test.concurrent("an unlimited credit row does not count free usage", () => {
		const state = creditState({ balance: 0, extra: { unlimited: true } });
		const mutation = computeTrack({
			fullSubject: freeCreditSubject({ state }),
			command: createTrackCommand({ value: 3, overageBehavior: "cap" }),
		});

		expect(trackResultOf({ mutation })).toMatchObject({ status: "applied" });
		expect(
			applyMutation({ state, mutation }).customerEntitlements[0]?.balance,
		).toBe(0);
	});

	test.concurrent(
		"check requires no credits and allows a free feature on an empty balance",
		() => {
			const result = computeCheck({
				fullSubject: freeCreditSubject({ state: creditState({ balance: 0 }) }),
				command: createCheckCommand({ requiredBalance: 1 }),
			});

			expect(result).toMatchObject({
				allowed: true,
				requiredBalance: 0,
				fundingFeatureId: "credits",
			});
		},
	);

	test.concurrent(
		"a lock on a free feature holds no credits, and confirming or releasing it moves none",
		() => {
			const initial = creditState({ balance: 300 });
			const locked = computeTrack({
				fullSubject: freeCreditSubject({ state: initial }),
				command: {
					...createTrackCommand({
						value: 1,
						overageBehavior: "reject",
						commandId: "cmd_lock",
					}),
					lock: {
						id: "lck_1",
						lockId: "L1",
						expiresAt: occurredAt + 86_400_000,
						expiryAction: "confirm" as const,
					},
				},
			});
			const lockedState = applyMutation({ state: initial, mutation: locked });
			expect(lockedState.customerEntitlements[0]?.balance).toBe(300);

			for (const finalValue of [0, 3]) {
				const finalized = computeFinalize({
					fullSubject: freeCreditSubject({ state: lockedState }),
					command: {
						schemaVersion: 1,
						type: "finalize",
						commandId: `cmd_finalize_${finalValue}`,
						requestId: `req_finalize_${finalValue}`,
						identity,
						occurredAt,
						org,
						lock: lockInsertOf(locked),
						internalFeatureId: "feat_messages",
						finalValue,
						properties: null,
					},
				});
				expect(
					applyMutation({ state: lockedState, mutation: finalized })
						.customerEntitlements[0]?.balance,
				).toBe(300);
			}
		},
	);
});

/** Locks `value` units, finalizes at `finalValue`, and returns the credit balance after each step. */
const lockThenFinalize = ({
	initial,
	subjectFor,
	value,
	finalValue,
}: {
	initial: SubjectState;
	subjectFor: (state: SubjectState) => WorkerFullSubject;
	value: number;
	finalValue: number;
}) => {
	const locked = computeTrack({
		fullSubject: subjectFor(initial),
		command: {
			...createTrackCommand({
				value,
				overageBehavior: "reject",
				commandId: "cmd_lock",
			}),
			lock: {
				id: "lck_1",
				lockId: "L1",
				expiresAt: occurredAt + 86_400_000,
				expiryAction: "confirm" as const,
			},
		},
	});
	expect(trackResultOf({ mutation: locked })).toMatchObject({
		status: "applied",
	});
	const lockedState = applyMutation({ state: initial, mutation: locked });
	const finalized = computeFinalize({
		fullSubject: subjectFor(lockedState),
		command: {
			schemaVersion: 1,
			type: "finalize",
			commandId: "cmd_finalize",
			requestId: "req_finalize",
			identity,
			occurredAt,
			org,
			lock: lockInsertOf(locked),
			internalFeatureId: "feat_messages",
			finalValue,
			properties: null,
		},
	});
	return {
		afterLock: lockedState.customerEntitlements[0]?.balance,
		afterFinalize: applyMutation({ state: lockedState, mutation: finalized })
			.customerEntitlements[0]?.balance,
	};
};

describe("zero credit cost through a plan item feature_override", () => {
	const overriddenFree = (state: SubjectState) =>
		freeCreditSubject({ state, creditAmount: 5, overrideCreditAmount: 0 });
	const overriddenPriced = (state: SubjectState) =>
		freeCreditSubject({ state, creditAmount: 0, overrideCreditAmount: 5 });

	test.concurrent(
		"an override pricing a catalog-priced feature at 0 makes track, check and lock free",
		() => {
			const empty = creditState({ balance: 0 });

			const tracked = computeTrack({
				fullSubject: overriddenFree(empty),
				command: createTrackCommand({ value: 3, overageBehavior: "reject" }),
			});
			expect(trackResultOf({ mutation: tracked })).toMatchObject({
				status: "applied",
				fundingCreditCost: 0,
			});
			expect(
				applyMutation({ state: empty, mutation: tracked })
					.customerEntitlements[0]?.balance,
			).toBe(0);

			expect(
				computeCheck({
					fullSubject: overriddenFree(empty),
					command: createCheckCommand({ requiredBalance: 2 }),
				}),
			).toMatchObject({ allowed: true, requiredBalance: 0 });

			expect(
				lockThenFinalize({
					initial: empty,
					subjectFor: overriddenFree,
					value: 1,
					finalValue: 4,
				}),
			).toEqual({ afterLock: 0, afterFinalize: 0 });
		},
	);

	test.concurrent(
		"an override pricing a catalog-free feature charges, checks and locks at the override's rate",
		() => {
			const funded = creditState({ balance: 300 });

			const tracked = computeTrack({
				fullSubject: overriddenPriced(funded),
				command: createTrackCommand({ value: 2, overageBehavior: "cap" }),
			});
			expect(
				applyMutation({ state: funded, mutation: tracked })
					.customerEntitlements[0]?.balance,
			).toBe(290);

			expect(
				computeCheck({
					fullSubject: overriddenPriced(funded),
					command: createCheckCommand({ requiredBalance: 1 }),
				}),
			).toMatchObject({ allowed: true, requiredBalance: 5 });

			expect(
				lockThenFinalize({
					initial: funded,
					subjectFor: overriddenPriced,
					value: 1,
					finalValue: 3,
				}),
			).toEqual({ afterLock: 295, afterFinalize: 285 });
			expect(
				lockThenFinalize({
					initial: funded,
					subjectFor: overriddenPriced,
					value: 2,
					finalValue: 0,
				}),
			).toEqual({ afterLock: 290, afterFinalize: 300 });
		},
	);
});
