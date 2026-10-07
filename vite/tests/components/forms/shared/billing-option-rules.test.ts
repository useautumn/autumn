import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { firstPhaseReplacesPlanNow } from "@/components/forms/create-schedule/utils/firstPhaseReplacesPlanNow";
import {
	type CustomerStatePhase,
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";

const scheduleResetRule = (
	state: Parameters<typeof getBillingOptionRules>[0]["state"],
) => getBillingOptionRules({ flow: "schedule", state }).resetBillingCycle;

describe("schedule billing cycle reset rule", () => {
	test("shows the reset for a new schedule", () => {
		expect(scheduleResetRule({})).toMatchObject({
			visible: true,
			disabled: false,
		});
	});

	test("allows the reset when the first phase has several plans", () => {
		expect(scheduleResetRule({})).toMatchObject({ disabled: false });
	});
});

const NOW_MS = Date.UTC(2027, 0, 1);
const CUSTOM_PRICE_ITEM = {
	feature_id: null,
	price: 30,
	interval: "month",
} as unknown as ProductItem;
const DAY_MS = 24 * 60 * 60 * 1000;

const product = ({
	id,
	group = "main",
	isAddOn = false,
}: {
	id: string;
	group?: string;
	isAddOn?: boolean;
}) =>
	({
		id,
		group,
		is_add_on: isAddOn,
		items: [],
		version: 1,
	}) as unknown as ProductV2;

const PRODUCTS = [
	product({ id: "free" }),
	product({ id: "pro" }),
	product({ id: "seats", isAddOn: true }),
	product({ id: "support", isAddOn: true }),
];

const MONTHLY_PRICE = {
	price: {
		is_custom: false,
		config: { type: "fixed", amount: 20, interval: "month" },
	},
};

const liveCustomerProduct = ({
	productId,
	entityId = null,
	status = CusProductStatus.Active,
	paid = false,
	subscriptionIds = [],
	trialEndsAt = null,
}: {
	productId: string;
	entityId?: string | null;
	status?: CusProductStatus;
	paid?: boolean;
	subscriptionIds?: string[];
	trialEndsAt?: number | null;
}) => {
	const { id, group, is_add_on } =
		PRODUCTS.find((candidate) => candidate.id === productId) ??
		product({ id: productId });
	return {
		id: `cus_prod_${productId}`,
		status,
		entity_id: entityId,
		internal_entity_id: entityId,
		product_id: id,
		is_custom: false,
		options: [],
		customer_entitlements: [],
		customer_licenses: [],
		customer_prices: paid ? [MONTHLY_PRICE] : [],
		subscription_ids: subscriptionIds,
		trial_ends_at: trialEndsAt,
		product: { id, group, is_add_on, version: 1 },
	} as unknown as FullCusProduct;
};

const firstPhase = ({
	productId,
	startsAt = null,
	entityId = null,
	plan = {},
}: {
	productId: string;
	startsAt?: number | null;
	entityId?: string | null;
	plan?: Partial<CustomerStatePlan>;
}): CustomerStatePhase[] => [
	{
		startsAt,
		plans: [{ ...EMPTY_CUSTOMER_STATE_PLAN, productId, entityId, ...plan }],
	},
];

const scheduleCarryOverUsagesRule = ({
	phases,
	customerProducts,
}: {
	phases: CustomerStatePhase[];
	customerProducts: FullCusProduct[];
}) =>
	getBillingOptionRules({
		flow: "schedule",
		state: {
			replacesPlanNow: firstPhaseReplacesPlanNow({
				phases,
				customerProducts,
				entities: [],
				products: PRODUCTS,
				nowMs: NOW_MS,
			}),
		},
	}).carryOverUsages;

describe("schedule carry over usages rule", () => {
	test("shows when a first phase starting now replaces the current plan", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "pro" }),
				customerProducts: [liveCustomerProduct({ productId: "free" })],
			}),
		).toMatchObject({ visible: true, disabled: false });
	});

	test("hides when the first phase starts later", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "pro", startsAt: NOW_MS + 7 * DAY_MS }),
				customerProducts: [liveCustomerProduct({ productId: "free" })],
			}).visible,
		).toBe(false);
	});

	test("hides when the customer has no current plan", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "pro" }),
				customerProducts: [],
			}).visible,
		).toBe(false);
	});

	test("hides when the only plan in the slot is scheduled, not live", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "pro" }),
				customerProducts: [
					liveCustomerProduct({
						productId: "free",
						status: CusProductStatus.Scheduled,
					}),
				],
			}).visible,
		).toBe(false);
	});

	test("shows when the current plan is re-listed with custom items", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({
					productId: "pro",
					plan: { isCustom: true, items: [CUSTOM_PRICE_ITEM] },
				}),
				customerProducts: [
					liveCustomerProduct({
						productId: "pro",
						paid: true,
						subscriptionIds: ["sub_1"],
					}),
				],
			}).visible,
		).toBe(true);
	});

	test("shows when the current plan is re-listed with a new prepaid quantity", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({
					productId: "pro",
					plan: { prepaidOptions: { messages: 500 } },
				}),
				customerProducts: [
					liveCustomerProduct({
						productId: "pro",
						paid: true,
						subscriptionIds: ["sub_1"],
					}),
				],
			}).visible,
		).toBe(true);
	});

	test("shows when an unchanged paid plan no Stripe subscription bills is re-listed", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "pro" }),
				customerProducts: [
					liveCustomerProduct({ productId: "pro", paid: true }),
				],
			}).visible,
		).toBe(true);
	});

	test("hides when an unchanged plan a Stripe subscription bills is re-listed", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "pro" }),
				customerProducts: [
					liveCustomerProduct({
						productId: "pro",
						paid: true,
						subscriptionIds: ["sub_1"],
					}),
				],
			}).visible,
		).toBe(false);
	});

	test("hides when an unchanged trialing plan with no subscription is re-listed", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "pro" }),
				customerProducts: [
					liveCustomerProduct({
						productId: "pro",
						paid: true,
						trialEndsAt: NOW_MS + 7 * DAY_MS,
					}),
				],
			}).visible,
		).toBe(false);
	});

	test("hides when the first phase keeps the current plan", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "free" }),
				customerProducts: [liveCustomerProduct({ productId: "free" })],
			}).visible,
		).toBe(false);
	});

	test("hides when the new plan is for another scope", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "pro", entityId: "ent_1" }),
				customerProducts: [liveCustomerProduct({ productId: "free" })],
			}).visible,
		).toBe(false);
	});

	test("hides when an add-on stacks beside the current add-on", () => {
		expect(
			scheduleCarryOverUsagesRule({
				phases: firstPhase({ productId: "support" }),
				customerProducts: [liveCustomerProduct({ productId: "seats" })],
			}).visible,
		).toBe(false);
	});
});

const attachRules = (
	state: Parameters<typeof getBillingOptionRules>[0]["state"],
) => getBillingOptionRules({ flow: "attach", state });

describe("attach single-plan-only options", () => {
	const shared = {
		hasActiveSubscription: true,
		hasCustomerEntitlements: true,
		showStartDate: true,
	};

	test("shows carry-over and line items for a single plan", () => {
		const rules = attachRules({ ...shared, isMultiPlan: false });
		expect(rules.carryOverBalances.visible).toBe(true);
		expect(rules.carryOverUsages.visible).toBe(true);
		expect(rules.overrideLineItems.visible).toBe(true);
	});

	test("hides carry-over and line items for multi-plan, which never sends them", () => {
		const rules = attachRules({ ...shared, isMultiPlan: true });
		expect(rules.carryOverBalances.visible).toBe(false);
		expect(rules.carryOverUsages.visible).toBe(false);
		expect(rules.overrideLineItems.visible).toBe(false);
		expect(rules.startDate.visible).toBe(true);
		expect(rules.resetBillingCycle.visible).toBe(true);
	});
});
