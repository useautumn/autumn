import { describe, expect, test } from "bun:test";
import type {
	AutumnBillingPlan,
	FullCusProduct,
	LineItem,
} from "@autumn/shared";
import { filterUnbilledUsageLineItems } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/filterUnbilledUsageLineItems";

const product = ({
	id,
	subscriptionIds = [],
}: {
	id: string;
	subscriptionIds?: string[];
}) => ({ id, subscription_ids: subscriptionIds }) as unknown as FullCusProduct;

const line = ({
	customerProduct,
	billingTiming,
	direction,
}: {
	customerProduct: FullCusProduct;
	billingTiming: "in_arrear" | "in_advance";
	direction: "charge" | "refund";
}) =>
	({
		context: { customerProduct, billingTiming, direction },
	}) as unknown as LineItem;

const unbilledPro = product({ id: "pro_unbilled" });
const billedPro = product({ id: "pro_billed", subscriptionIds: ["sub_1"] });
const newPremium = product({ id: "premium_new" });

const planWith = (lineItems: LineItem[]) =>
	({
		insertCustomerProducts: [newPremium],
		lineItems,
	}) as unknown as AutumnBillingPlan;

describe("filterUnbilledUsageLineItems", () => {
	test("keeps the accrued usage of a plan no subscription billed", () => {
		const usage = line({
			customerProduct: unbilledPro,
			billingTiming: "in_arrear",
			direction: "charge",
		});
		expect(
			filterUnbilledUsageLineItems({ autumnBillingPlan: planWith([usage]) }),
		).toEqual([usage]);
	});

	test("never credits unused time of a plan Stripe never charged", () => {
		const credit = line({
			customerProduct: unbilledPro,
			billingTiming: "in_advance",
			direction: "refund",
		});
		expect(
			filterUnbilledUsageLineItems({ autumnBillingPlan: planWith([credit]) }),
		).toEqual([]);
	});

	test("leaves subscription-billed and newly inserted plans to the subscription invoice", () => {
		const billedUsage = line({
			customerProduct: billedPro,
			billingTiming: "in_arrear",
			direction: "charge",
		});
		const newCharge = line({
			customerProduct: newPremium,
			billingTiming: "in_advance",
			direction: "charge",
		});
		const newUsage = line({
			customerProduct: newPremium,
			billingTiming: "in_arrear",
			direction: "charge",
		});
		expect(
			filterUnbilledUsageLineItems({
				autumnBillingPlan: planWith([billedUsage, newCharge, newUsage]),
			}),
		).toEqual([]);
	});
});
