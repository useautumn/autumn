import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import {
	applyMutation,
	computeFinalize,
	computeTrack,
	createSubjectState,
	type SubjectState,
	subjectStateToFullSubject,
	type WorkerFullSubject,
} from "../../../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	occurredAt,
	org,
} from "../../engineFixtures.js";

/** Messages are paid in credits: the first 2 units cost 1 credit each, every unit after costs 3. */
const graduatedSubjectFor = ({
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
			{
				metered_feature_id: "messages",
				feature_amount: 1,
				tier_behavior: "graduated",
				tiers: [
					{ to: 2, credit_amount: 1 },
					{ to: "inf", credit_amount: 3 },
				],
			},
		],
	};
	return subjectStateToFullSubject({ state, catalog });
};

const track = ({
	state,
	value,
	locks,
}: {
	state: SubjectState;
	value: number;
	locks: boolean;
}) => {
	const mutation = computeTrack({
		fullSubject: graduatedSubjectFor({ state }),
		command: {
			...createTrackCommand({ value, commandId: `cmd_${value}_${locks}` }),
			...(locks && {
				lock: {
					id: "lck_1",
					lockId: "L1",
					expiresAt: occurredAt + 86_400_000,
					expiryAction: "confirm" as const,
				},
			}),
		},
	});
	return { mutation, state: applyMutation({ state, mutation }) };
};

test.concurrent(
	"a release on a graduated rate gives back the current marginal tail, not what the lock paid",
	() => {
		const initial = createSubjectState({
			identity,
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [
				createCustomerEntitlement({
					id: "credits_row",
					featureId: "credits",
					balance: 100,
				}),
			],
		});
		// The lock takes unit 1 at 1 credit; the track after it takes units 2-4 for 1 + 3 + 3.
		const locked = track({ state: initial, value: 1, locks: true });
		const tracked = track({ state: locked.state, value: 3, locks: false });
		expect(tracked.state.customerEntitlements[0]?.balance).toBe(92);

		const lockChange = locked.mutation.changes.find(
			(change) => change.table === "locks" && change.op === "insert",
		);
		if (lockChange?.table !== "locks" || lockChange.op !== "insert")
			throw new Error("Expected the track to open a lock");
		const mutation = computeFinalize({
			fullSubject: graduatedSubjectFor({ state: tracked.state }),
			command: {
				schemaVersion: 1,
				type: "finalize",
				commandId: "cmd_release",
				requestId: "req_release",
				identity,
				occurredAt,
				org,
				lock: lockChange.row,
				internalFeatureId: "feat_messages",
				finalValue: 0,
				properties: null,
			},
		});
		const [row] = applyMutation({
			state: tracked.state,
			mutation,
		}).customerEntitlements;

		// Unit 4 cost 3 credits, so 3 come back and the 3 units left still cost 1 + 1 + 3.
		expect(row?.balance).toBe(95);
		expect(row?.usage_attribution).toMatchObject({
			feat_messages: { units: 3, credits: 5 },
		});
	},
);
