/**
 * The sub.created takeover guard must cover every phase the sync processes:
 * a future-phase main plan expires the customer's current plan at sync time
 * just like a current-phase one.
 *
 * Red (before): only the current phase was checked, so an add-on now with a
 *               main plan in the next phase slipped past the guard.
 * Green (after): a main plan in any matched phase trips it.
 */
import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import { findPlanLinkedToAnotherSubscription } from "@/external/stripe/webhookHandlers/common/subscriptionSync/findPlanLinkedToAnotherSubscription";
import type {
	MatchedPlan,
	PhaseMatch,
	SubscriptionMatch,
} from "@/internal/billing/v2/actions/sync/detect/types";

const NEW_SUBSCRIPTION_ID = "sub_new";
const PAYING_SUBSCRIPTION_ID = "sub_paying";

const product = ({
	id,
	isAddOn = false,
}: {
	id: string;
	isAddOn?: boolean;
}): FullProduct =>
	({
		id,
		group: "main",
		is_add_on: isAddOn,
		prices: [],
		entitlements: [],
	}) as unknown as FullProduct;

const matchedPlan = ({ product }: { product: FullProduct }): MatchedPlan => ({
	product,
	quantity: 1,
	base: { kind: "absent" },
	features: [],
	extras: [],
	warnings: [],
});

const phase = ({
	plans,
	isCurrent,
}: {
	plans: MatchedPlan[];
	isCurrent: boolean;
}): PhaseMatch => ({
	start_date: isCurrent ? 100 : 200,
	end_date: isCurrent ? 200 : null,
	is_current: isCurrent,
	item_diffs: [],
	plans,
});

const customerWithPlanOn = ({
	subscriptionIds,
}: {
	subscriptionIds: string[];
}): FullCustomer =>
	({
		customer_products: [
			{
				id: "cus_prod_pro",
				product_id: "pro",
				status: CusProductStatus.Active,
				subscription_ids: subscriptionIds,
				internal_entity_id: null,
				product: product({ id: "pro" }),
				customer_prices: [],
			} as unknown as FullCusProduct,
		],
	}) as unknown as FullCustomer;

const matchOf = (phaseMatches: PhaseMatch[]): SubscriptionMatch => ({
	stripe_subscription_id: NEW_SUBSCRIPTION_ID,
	stripe_schedule_id: null,
	phaseMatches,
});

describe("findPlanLinkedToAnotherSubscription", () => {
	test("finds a current-phase main plan that belongs to another subscription", () => {
		const found = findPlanLinkedToAnotherSubscription({
			match: matchOf([
				phase({
					plans: [matchedPlan({ product: product({ id: "pro" }) })],
					isCurrent: true,
				}),
			]),
			fullCustomer: customerWithPlanOn({
				subscriptionIds: [PAYING_SUBSCRIPTION_ID],
			}),
			stripeSubscriptionId: NEW_SUBSCRIPTION_ID,
		});
		expect(found?.id).toBe("cus_prod_pro");
	});

	test("finds a future-phase main plan behind a current-phase add-on", () => {
		const found = findPlanLinkedToAnotherSubscription({
			match: matchOf([
				phase({
					plans: [
						matchedPlan({ product: product({ id: "addon", isAddOn: true }) }),
					],
					isCurrent: true,
				}),
				phase({
					plans: [matchedPlan({ product: product({ id: "premium" }) })],
					isCurrent: false,
				}),
			]),
			fullCustomer: customerWithPlanOn({
				subscriptionIds: [PAYING_SUBSCRIPTION_ID],
			}),
			stripeSubscriptionId: NEW_SUBSCRIPTION_ID,
		});
		expect(found?.id).toBe("cus_prod_pro");
	});

	test("ignores a plan with no subscription, or already on this subscription", () => {
		const match = matchOf([
			phase({
				plans: [matchedPlan({ product: product({ id: "pro" }) })],
				isCurrent: true,
			}),
		]);
		for (const subscriptionIds of [[], [NEW_SUBSCRIPTION_ID]]) {
			expect(
				findPlanLinkedToAnotherSubscription({
					match,
					fullCustomer: customerWithPlanOn({ subscriptionIds }),
					stripeSubscriptionId: NEW_SUBSCRIPTION_ID,
				}),
			).toBeUndefined();
		}
	});
});
