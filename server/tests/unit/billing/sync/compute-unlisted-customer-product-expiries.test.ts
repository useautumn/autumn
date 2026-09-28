import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type SyncBillingContext,
	type SyncProductContext,
} from "@autumn/shared";
import type Stripe from "stripe";
import { computeUnlistedCustomerProductExpiries } from "@/internal/billing/v2/actions/sync/compute/computeUnlistedCustomerProductExpiries";

const liveCustomerProduct = ({ id }: { id: string }): FullCusProduct =>
	({
		id,
		status: CusProductStatus.Active,
		subscription_ids: ["sub_123"],
	}) as unknown as FullCusProduct;

const syncContext = ({
	customerProducts,
	immediateProductContexts,
}: {
	customerProducts: FullCusProduct[];
	immediateProductContexts: SyncProductContext[];
}): SyncBillingContext => ({
	customer_id: "customer_123",
	fullCustomer: {
		customer_products: customerProducts,
	} as unknown as FullCustomer,
	stripeSubscription: { id: "sub_123" } as Stripe.Subscription,
	stripeSchedule: null,
	currency: "usd",
	immediatePhase: {
		startsAt: Date.now(),
		endsAt: null,
		productContexts: immediateProductContexts,
	},
	futurePhases: [],
	unscheduledProductContexts: [],
	queuedCustomerProducts: [],
	currentEpochMs: Date.now(),
	acknowledgedWarnings: [],
	expireUnlistedPlans: true,
	carryOverUsage: true,
});

describe("computeUnlistedCustomerProductExpiries", () => {
	test("keeps a listed plan the sync only changes seats on, and expires the left-out one", () => {
		const team = liveCustomerProduct({ id: "cus_prod_team" });
		const removedAddOn = liveCustomerProduct({ id: "cus_prod_add_on" });

		const expiries = computeUnlistedCustomerProductExpiries({
			syncContext: syncContext({
				customerProducts: [team, removedAddOn],
				immediateProductContexts: [
					{ currentCustomerProduct: team } as SyncProductContext,
				],
			}),
		});

		expect(expiries.map(({ customerProduct }) => customerProduct.id)).toEqual([
			"cus_prod_add_on",
		]);
	});
});
