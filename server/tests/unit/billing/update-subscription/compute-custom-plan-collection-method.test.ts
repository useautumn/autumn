/**
 * Rebuilding a customer product in update subscription keeps its collection
 * method, so a mid-trial edit doesn't drop a no-card trial's invoice intent.
 */

import { expect, test } from "bun:test";
import {
	BillingVersion,
	CollectionMethod,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { products } from "@tests/utils/fixtures/db/products";
import { computeCustomPlanNewCustomerProduct } from "@/internal/billing/v2/actions/updateSubscription/compute/customPlan/computeCustomPlanNewCustomerProduct";

const NOW_MS = 1_760_000_000_000;

const rebuiltCollectionMethod = ({
	collectionMethod,
}: {
	collectionMethod: CollectionMethod;
}) => {
	const fullProduct = products.createFull({ id: "pro" });
	const currentCustomerProduct = {
		...customerProducts.create({ productId: "pro", product: fullProduct }),
		collection_method: collectionMethod,
	};

	return computeCustomPlanNewCustomerProduct({
		ctx: contexts.create({}),
		params: { customer_id: "cus_test", plan_id: "pro" },
		updateSubscriptionContext: {
			customerProduct: currentCustomerProduct,
			fullCustomer: customers.create({
				customerProducts: [currentCustomerProduct],
			}),
			fullProducts: [fullProduct],
			featureQuantities: [],
			currentEpochMs: NOW_MS,
			billingCycleAnchorMs: NOW_MS,
			resetCycleAnchorMs: NOW_MS,
			intent: UpdateSubscriptionIntent.UpdatePlan,
			billingVersion: BillingVersion.V2,
		} as UpdateSubscriptionBillingContext,
		fullProduct,
		currentCustomerProduct,
	}).collection_method;
};

test.each([CollectionMethod.SendInvoice, CollectionMethod.ChargeAutomatically])(
	"rebuilt customer product keeps collection_method %s",
	(collectionMethod) => {
		expect(rebuiltCollectionMethod({ collectionMethod })).toBe(
			collectionMethod,
		);
	},
);
