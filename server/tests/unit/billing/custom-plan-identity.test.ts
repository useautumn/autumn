import { expect, test } from "bun:test";
import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { handleCustomPlanErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleCustomPlanErrors";

test.each([false, true])(
	"identical custom items reject only an unchanged plan identity: patch=%s",
	(patch) => {
		const current = customerProducts.create({ productId: "pro" });
		const target = customerProducts.create({ productId: "premium" });
		const run = () =>
			handleCustomPlanErrors({
				ctx: contexts.create({}),
				billingContext: {
					customerProduct: current,
					patchContext: patch ? { finalCustomerProduct: target } : undefined,
					invoiceMode: false,
				} as unknown as UpdateSubscriptionBillingContext,
				autumnBillingPlan: {
					customerId: "customer_123",
					insertCustomerProducts: patch ? [] : [target],
				},
				params: {
					customer_id: "customer_123",
					plan_id: "pro",
					customize: { items: [] },
				},
			});
		expect(run).not.toThrow();
		target.internal_product_id = current.internal_product_id;
		target.product = current.product;
		expect(run).toThrow("Custom plan configuration is identical");
	},
);
