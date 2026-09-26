import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import {
	checkAfterDeduction,
	computeCheck,
	computeTrackDecision,
	createSubjectState,
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
} from "../../engineFixtures.js";

/** Messages are paid in credits: the first 2 units cost 1 credit each, every unit after costs 3. */
const graduatedSubject = ({
	customerEntitlements,
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
}): WorkerFullSubject => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
	});
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

const creditRow = ({
	id = "credits_row",
	balance,
	unitsUsed = 0,
	creditsUsed = 0,
	usageAllowed = false,
}: {
	id?: string;
	balance: number;
	unitsUsed?: number;
	creditsUsed?: number;
	usageAllowed?: boolean;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id, featureId: "credits", balance }),
	usage_allowed: usageAllowed,
	usage_attribution: {
		feat_messages: { units: unitsUsed, credits: creditsUsed },
	},
});

test.concurrent(
	"required_balance prices a graduated requirement across the tier boundary",
	() => {
		const result = computeCheck({
			fullSubject: graduatedSubject({
				customerEntitlements: [
					creditRow({ balance: 99, unitsUsed: 1, creditsUsed: 1 }),
				],
			}),
			command: createCheckCommand({ requiredBalance: 3 }),
		});

		// Unit 2 at 1 credit, units 3-4 at 3 each.
		expect(result).toMatchObject({
			allowed: true,
			requiredBalance: 7,
			fundingFeatureId: "credits",
		});
	},
);

test.concurrent(
	"required_balance keeps walking the tiers past what the balance covers",
	() => {
		const result = computeCheck({
			fullSubject: graduatedSubject({
				customerEntitlements: [creditRow({ balance: 2 })],
			}),
			command: createCheckCommand({ requiredBalance: 3 }),
		});

		// The 2 credits cover units 1-2; unit 3 still costs 3.
		expect(result).toMatchObject({ allowed: false, requiredBalance: 5 });
	},
);

test.concurrent(
	"what no balance covers is priced on the last credit row from its own tier position",
	() => {
		const result = computeCheck({
			fullSubject: graduatedSubject({
				customerEntitlements: [
					creditRow({
						id: "base_credits",
						balance: 0,
						unitsUsed: 4,
						creditsUsed: 8,
						usageAllowed: true,
					}),
					creditRow({ id: "addon_credits", balance: 0, usageAllowed: true }),
				],
			}),
			command: createCheckCommand({ requiredBalance: 1 }),
		});

		// The add-on has charged nothing yet, so its first unit costs the first tier's 1 credit.
		expect(result).toMatchObject({ allowed: true, requiredBalance: 1 });
	},
);

test.concurrent(
	"a check after a track prices from the tier position the track left",
	() => {
		const fullSubject = graduatedSubject({
			customerEntitlements: [creditRow({ balance: 100 })],
		});
		const { outcome } = computeTrackDecision({
			fullSubject,
			command: createTrackCommand({ value: 2 }),
		});

		const { after, before } = checkAfterDeduction({
			fullSubject,
			command: createCheckCommand({ requiredBalance: 1 }),
			outcome,
		});

		expect(before().requiredBalance).toBe(1);
		expect(after.requiredBalance).toBe(3);
	},
);
