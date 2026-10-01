import { expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type StripeBillingPlan,
} from "@autumn/shared";
import { addStripeSubscriptionScheduleIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";

const SCHEDULE_ID = "sub_sched_new";

const customerProduct = ({
	id,
	isPaid,
}: {
	id: string;
	isPaid: boolean;
}): FullCusProduct =>
	({
		id,
		product: { is_add_on: false },
		customer_prices: isPaid
			? [
					{
						price: { config: { type: "fixed", amount: 20, interval: "month" } },
					},
				]
			: [],
		customer_licenses: [],
	}) as unknown as FullCusProduct;

const keptPlan = ({
	id,
	isPaid,
	status,
}: {
	id: string;
	isPaid: boolean;
	status?: CusProductStatus;
}) => ({
	customerProduct: customerProduct({ id, isPaid }),
	updates: { ended_at: 1_790_000_000_000, ...(status ? { status } : {}) },
});

test("only kept plans billed on the Stripe schedule get its id; free and expiring ones don't", () => {
	const updateCustomerProducts = [
		keptPlan({ id: "paid", isPaid: true }),
		keptPlan({ id: "free", isPaid: false }),
		keptPlan({
			id: "expiring",
			isPaid: true,
			status: CusProductStatus.Expired,
		}),
	];
	const autumnBillingPlan = {
		insertCustomerProducts: [],
		updateCustomerProducts,
	} as unknown as AutumnBillingPlan;

	addStripeSubscriptionScheduleIdToBillingPlan({
		autumnBillingPlan,
		stripeBillingPlan: {} as StripeBillingPlan,
		stripeSubscriptionScheduleId: SCHEDULE_ID,
	});

	expect(
		updateCustomerProducts.map(({ customerProduct, updates }) => [
			customerProduct.id,
			(updates as { scheduled_ids?: string[] }).scheduled_ids,
		]),
	).toEqual([
		["paid", [SCHEDULE_ID]],
		["free", undefined],
		["expiring", undefined],
	]);
});
