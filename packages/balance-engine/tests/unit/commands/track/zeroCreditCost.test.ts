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

/** Messages are free in credits: the credit system lists them at 0 credits per unit. */
const freeCreditSubject = ({
	state,
}: {
	state: SubjectState;
}): WorkerFullSubject => {
	const catalog = createCatalogFor({ state });
	const credits = catalog.features.feat_credits;
	if (!credits) throw new Error("credits feature row missing");
	credits.type = FeatureType.CreditSystem;
	credits.config = {
		schema: [
			{ metered_feature_id: "messages", feature_amount: 1, credit_amount: 0 },
		],
	};
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
