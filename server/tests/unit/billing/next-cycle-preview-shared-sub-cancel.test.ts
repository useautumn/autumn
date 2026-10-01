import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	BillingInterval,
	type BillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type Price,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { billingPlanToNextCyclePreview } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";

const anchorMs = Date.UTC(2026, 0, 1);
const currentEpochMs = Date.UTC(2026, 0, 11);
const renewalBoundaryMs = Date.UTC(2026, 1, 1);

const plan = ({
	id,
	amount,
	startsAt = anchorMs,
	endedAt,
	status = CusProductStatus.Active,
	interval = BillingInterval.Month,
	group,
	subscriptionId = "sub_shared",
}: {
	id: string;
	amount: number;
	startsAt?: number;
	endedAt?: number;
	status?: CusProductStatus;
	interval?: BillingInterval;
	group?: string;
	subscriptionId?: string;
}): FullCusProduct => {
	const fixedPrice = prices.createFixed({ id: `price_${id}` });
	const price = {
		...fixedPrice,
		config: { ...fixedPrice.config, amount, interval },
	} as Price;
	const product = products.createFull({ id, prices: [price] });

	return customerProducts.create({
		id,
		productId: id,
		status,
		startsAt,
		endedAt,
		subscriptionIds: [subscriptionId],
		customerPrices: [prices.createCustomer({ price, customerProductId: id })],
		product: group ? { ...product, group } : product,
	});
};

const previewNextCycle = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}) =>
	billingPlanToNextCyclePreview({
		ctx: contexts.create({}),
		billingContext: contexts.createBilling({
			customerProducts,
			currentEpochMs,
			billingCycleAnchorMs: anchorMs,
		}),
		billingPlan: {
			autumn: {
				insertCustomerProducts: [],
				lineItems: [],
			} as unknown as AutumnBillingPlan,
		} as BillingPlan,
	}).nextCycle;

describe("next cycle preview on a shared subscription", () => {
	test("still bills the plan that keeps renewing when another is cancelled end of cycle", () => {
		const nextCycle = previewNextCycle({
			customerProducts: [
				plan({ id: "pro-a", amount: 20 }),
				plan({
					id: "premium-b",
					amount: 50,
					endedAt: renewalBoundaryMs,
				}),
			],
		});

		expect(nextCycle?.starts_at).toBe(renewalBoundaryMs);
		expect(nextCycle?.total).toBe(20);
		expect(nextCycle?.line_items.map((lineItem) => lineItem.total)).toEqual([
			20,
		]);
	});

	test("bills nothing when every plan on the subscription is cancelled end of cycle", () => {
		const nextCycle = previewNextCycle({
			customerProducts: [
				plan({
					id: "premium-b",
					amount: 50,
					endedAt: renewalBoundaryMs,
				}),
			],
		});

		expect(nextCycle?.starts_at).toBe(renewalBoundaryMs);
		expect(nextCycle?.total).toBe(0);
		expect(nextCycle?.line_items).toEqual([]);
	});

	test("does not bill a plan that renews on a later boundary", () => {
		const nextCycle = previewNextCycle({
			customerProducts: [
				plan({ id: "pro-a", amount: 20 }),
				plan({
					id: "annual-c",
					amount: 200,
					interval: BillingInterval.Year,
				}),
				plan({
					id: "premium-b",
					amount: 50,
					endedAt: renewalBoundaryMs,
				}),
			],
		});

		expect(nextCycle?.total).toBe(20);
		expect(nextCycle?.line_items.map((lineItem) => lineItem.plan_id)).toEqual([
			"pro-a",
		]);
	});

	test("does not bill a plan on another subscription renewing at the same boundary", () => {
		const nextCycle = previewNextCycle({
			customerProducts: [
				plan({ id: "pro-a", amount: 20 }),
				plan({ id: "addon-x", amount: 30, subscriptionId: "sub_other" }),
				plan({
					id: "premium-b",
					amount: 50,
					endedAt: renewalBoundaryMs,
				}),
			],
		});

		expect(nextCycle?.total).toBe(20);
		expect(nextCycle?.line_items.map((lineItem) => lineItem.plan_id)).toEqual([
			"pro-a",
		]);
	});

	test("a plan switch at renewal still bills only the incoming plan", () => {
		const nextCycle = previewNextCycle({
			customerProducts: [
				plan({
					id: "pro",
					amount: 20,
					endedAt: renewalBoundaryMs,
					group: "main",
				}),
				plan({
					id: "premium",
					amount: 50,
					startsAt: renewalBoundaryMs,
					status: CusProductStatus.Scheduled,
					group: "main",
				}),
			],
		});

		expect(nextCycle?.starts_at).toBe(renewalBoundaryMs);
		expect(nextCycle?.total).toBe(50);
		expect(nextCycle?.line_items.map((lineItem) => lineItem.plan_id)).toEqual([
			"premium",
		]);
	});

	test("a cancellation before renewal only credits the cancelled plan", () => {
		const cancelledAtMs = currentEpochMs + 5 * 24 * 60 * 60 * 1000;
		const nextCycle = previewNextCycle({
			customerProducts: [
				plan({ id: "pro-a", amount: 20 }),
				plan({ id: "premium-b", amount: 50, endedAt: cancelledAtMs }),
			],
		});

		expect(nextCycle?.starts_at).toBe(cancelledAtMs);
		expect(nextCycle?.line_items.map((lineItem) => lineItem.plan_id)).toEqual([
			"premium-b",
		]);
		expect(nextCycle?.total).toBeLessThan(0);
	});
});
