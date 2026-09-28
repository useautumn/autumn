import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	type AttachBillingContext,
	type AttachParamsV1,
	BillingInterval,
	BillWhen,
	EntInterval,
	FeatureType,
	type FullCusProduct,
	PriceType,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { addMonths } from "date-fns";
import { cusProductToExistingBalanceCarryOvers } from "@/internal/billing/v2/utils/handleCarryOvers/cusProductToExistingBalanceCarryOvers";

const NEXT_RESET_AT = Date.UTC(2026, 9, 23, 5, 13);

const buildCarryOverSource = ({
	balance,
	rollover,
	priceBillWhen,
}: {
	balance: number;
	rollover: RolloverConfig | null;
	/** Bill timing of the feature's usage price; omitted = no price (free). */
	priceBillWhen?: BillWhen;
}) =>
	({
		id: "cus_prod_hobby",
		internal_entity_id: null,
		customer_prices: priceBillWhen
			? [
					{
						id: "cus_price_hobby_credits",
						customer_product_id: "cus_prod_hobby",
						price: {
							id: "price_hobby_credits",
							entitlement_id: "ent_hobby_credits",
							config: {
								type: PriceType.Usage,
								bill_when: priceBillWhen,
								interval: BillingInterval.Month,
								feature_id: "credits",
								internal_feature_id: "fe_credits",
								usage_tiers: [{ to: -1, amount: 0.1 }],
								billing_units: 1,
							},
						},
					},
				]
			: [],
		customer_entitlements: [
			{
				id: "cus_ent_hobby_credits",
				customer_product_id: "cus_prod_hobby",
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

const buildNewCustomerProduct = ({ allowance }: { allowance: number }) =>
	({
		id: "cus_prod_pro",
		internal_entity_id: null,
		customer_prices: [],
		customer_entitlements: [
			{
				id: "cus_ent_pro_credits",
				internal_feature_id: "fe_credits",
				balance: allowance,
				adjustment: 0,
				unlimited: false,
				usage_allowed: false,
				entities: null,
				entitlement: {
					id: "ent_pro_credits",
					internal_feature_id: "fe_credits",
					feature_id: "credits",
					allowance,
					allowance_type: AllowanceType.Fixed,
					interval: EntInterval.Month,
					interval_count: 1,
					entity_feature_id: null,
					rollover: null,
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
	newCustomerProduct = buildNewCustomerProduct({ allowance: 0 }),
	priceBillWhen,
}: {
	balance?: number;
	rollover: RolloverConfig | null;
	newCustomerProduct?: FullCusProduct;
	priceBillWhen?: BillWhen;
}) =>
	cusProductToExistingBalanceCarryOvers({
		newCustomerProduct,
		attachBillingContext: {
			planTiming: "immediate",
			carryOverSourceCustomerProduct: buildCarryOverSource({
				balance,
				rollover,
				priceBillWhen,
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
});

describe("cusProductToExistingBalanceCarryOvers negative balances", () => {
	test("debt is paid down from the new plan's grant, not kept as a loose row", () => {
		const newCustomerProduct = buildNewCustomerProduct({ allowance: 500 });
		const { entitlements, customerEntitlements } = computeCarryOvers({
			balance: -20,
			rollover: null,
			newCustomerProduct,
		});

		expect(entitlements).toHaveLength(0);
		expect(customerEntitlements).toHaveLength(0);
		expect(newCustomerProduct.customer_entitlements[0].balance).toBe(480);
	});

	test("debt larger than the new grant leaves the new plan negative", () => {
		const newCustomerProduct = buildNewCustomerProduct({ allowance: 10 });
		const { customerEntitlements } = computeCarryOvers({
			balance: -20,
			rollover: null,
			newCustomerProduct,
		});

		expect(customerEntitlements).toHaveLength(0);
		expect(newCustomerProduct.customer_entitlements[0].balance).toBe(-10);
	});

	test("priced overage is not paid down again (already invoiced in arrears)", () => {
		const newCustomerProduct = buildNewCustomerProduct({ allowance: 500 });
		const { customerEntitlements } = computeCarryOvers({
			balance: -20,
			rollover: null,
			newCustomerProduct,
			priceBillWhen: BillWhen.EndOfPeriod,
		});

		expect(customerEntitlements).toHaveLength(1);
		expect(customerEntitlements[0].balance).toBe(-20);
		expect(newCustomerProduct.customer_entitlements[0].balance).toBe(500);
	});

	test("prepaid (in-advance) debt is paid down: it is never invoiced in arrears", () => {
		const newCustomerProduct = buildNewCustomerProduct({ allowance: 500 });
		const { customerEntitlements } = computeCarryOvers({
			balance: -20,
			rollover: null,
			newCustomerProduct,
			priceBillWhen: BillWhen.StartOfPeriod,
		});

		expect(customerEntitlements).toHaveLength(0);
		expect(newCustomerProduct.customer_entitlements[0].balance).toBe(480);
	});

	test("debt stays a loose row when the new plan has no grant for the feature", () => {
		const newCustomerProduct = {
			...buildNewCustomerProduct({ allowance: 0 }),
			customer_entitlements: [],
		} as unknown as FullCusProduct;
		const { customerEntitlements } = computeCarryOvers({
			balance: -20,
			rollover: {
				max: null,
				length: 1,
				duration: RolloverExpiryDurationType.Forever,
			},
			newCustomerProduct,
		});

		expect(customerEntitlements).toHaveLength(1);
		expect(customerEntitlements[0].balance).toBe(-20);
		expect(customerEntitlements[0].expires_at).toBe(NEXT_RESET_AT);
	});
});
