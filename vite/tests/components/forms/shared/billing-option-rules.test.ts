import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type ProductV2,
} from "@autumn/shared";
import { firstPhaseReplacesPlanNow } from "@/components/forms/create-schedule/utils/firstPhaseReplacesPlanNow";
import {
	type CustomerStatePhase,
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
const DAY_MS = 24 * 60 * 60 * 1000;

const product = ({
	id,
	group = "main",
	isAddOn = false,
}: {
	id: string;
	group?: string;
	isAddOn?: boolean;
}) => ({ id, group, is_add_on: isAddOn, items: [] }) as unknown as ProductV2;

const PRODUCTS = [
	product({ id: "free" }),
	product({ id: "pro" }),
	product({ id: "seats", isAddOn: true }),
	product({ id: "support", isAddOn: true }),
];

const liveCustomerProduct = ({
	productId,
	entityId = null,
	status = CusProductStatus.Active,
}: {
	productId: string;
	entityId?: string | null;
	status?: CusProductStatus;
}) => {
	const { id, group, is_add_on } =
		PRODUCTS.find((candidate) => candidate.id === productId) ??
		product({ id: productId });
	return {
		id: `cus_prod_${productId}`,
		status,
		entity_id: entityId,
		internal_entity_id: entityId,
		customer_prices: [],
		product: { id, group, is_add_on },
	} as unknown as FullCusProduct;
};

const firstPhase = ({
	productId,
	startsAt = null,
	entityId = null,
}: {
	productId: string;
	startsAt?: number | null;
	entityId?: string | null;
}): CustomerStatePhase[] => [
	{
		startsAt,
		plans: [{ ...EMPTY_CUSTOMER_STATE_PLAN, productId, entityId }],
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
