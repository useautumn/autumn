import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	type AttachBillingContext,
	type AttachParamsV1,
	EntInterval,
	FeatureType,
	type FullCusProduct,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { addMonths } from "date-fns";
import { cusProductToExistingBalanceCarryOvers } from "@/internal/billing/v2/utils/handleCarryOvers/cusProductToExistingBalanceCarryOvers";

const NEXT_RESET_AT = Date.UTC(2026, 9, 23, 5, 13);

const buildCarryOverSource = ({
	balance,
	rollover,
}: {
	balance: number;
	rollover: RolloverConfig | null;
}) =>
	({
		id: "cus_prod_hobby",
		internal_entity_id: null,
		customer_prices: [],
		customer_entitlements: [
			{
				id: "cus_ent_hobby_credits",
				balance,
				unlimited: false,
				entities: null,
				next_reset_at: NEXT_RESET_AT,
				entitlement: {
					id: "ent_hobby_credits",
					internal_feature_id: "fe_credits",
					feature_id: "credits",
					allowance: 100,
					allowance_type: AllowanceType.Fixed,
					interval: EntInterval.Month,
					interval_count: 1,
					entity_feature_id: null,
					rollover,
					feature: {
						id: "credits",
						internal_id: "fe_credits",
						type: FeatureType.Metered,
						config: {},
					},
				},
			},
		],
	}) as unknown as FullCusProduct;

const computeCarryOvers = ({
	balance = 70,
	rollover,
}: {
	balance?: number;
	rollover: RolloverConfig | null;
}) =>
	cusProductToExistingBalanceCarryOvers({
		attachBillingContext: {
			planTiming: "immediate",
			carryOverSourceCustomerProduct: buildCarryOverSource({
				balance,
				rollover,
			}),
			fullCustomer: {
				id: "customer_1",
				internal_id: "cus_internal_1",
				org_id: "org_1",
				entities: [],
			},
		} as unknown as AttachBillingContext,
		params: {
			carry_over_balances: { enabled: true, feature_ids: ["credits"] },
		} as unknown as AttachParamsV1,
	});

describe("cusProductToExistingBalanceCarryOvers expiry", () => {
	test("item without rollover expires at the old plan's next reset", () => {
		const { customerEntitlements } = computeCarryOvers({ rollover: null });

		expect(customerEntitlements).toHaveLength(1);
		expect(customerEntitlements[0].expires_at).toBe(NEXT_RESET_AT);
	});

	test("forever rollover item carries over with no expiry", () => {
		const { customerEntitlements } = computeCarryOvers({
			rollover: {
				max: null,
				length: 1,
				duration: RolloverExpiryDurationType.Forever,
			},
		});

		expect(customerEntitlements).toHaveLength(1);
		expect(customerEntitlements[0].balance).toBe(70);
		expect(customerEntitlements[0].expires_at).toBeNull();
	});

	test("monthly rollover item expires when the rollover would have", () => {
		const { customerEntitlements } = computeCarryOvers({
			rollover: {
				max: null,
				length: 2,
				duration: RolloverExpiryDurationType.Month,
			},
		});

		expect(customerEntitlements).toHaveLength(1);
		expect(customerEntitlements[0].expires_at).toBe(
			addMonths(NEXT_RESET_AT, 2).getTime(),
		);
	});

	test("negative balance on a rollover item keeps the reset expiry", () => {
		const { customerEntitlements } = computeCarryOvers({
			balance: -20,
			rollover: {
				max: null,
				length: 1,
				duration: RolloverExpiryDurationType.Forever,
			},
		});

		expect(customerEntitlements).toHaveLength(1);
		expect(customerEntitlements[0].expires_at).toBe(NEXT_RESET_AT);
	});
});
