import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	EntInterval,
	type FullCusProduct,
	type FullProduct,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import { entitlements } from "@tests/utils/fixtures/db/entitlements.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { computeCancelPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/cancel/computeCancelPlan.js";
import { computeRevertTrialExpiryPlan } from "@/internal/customers/cusProducts/actions/revertTrialExpiry.js";

const NOW = Date.UTC(2027, 0, 1);
const entity = entities.create({ id: "entity_one", featureId: "seats" });

const createPooledProduct = ({ id }: { id: string }): FullProduct => {
	const pooledEntitlement = {
		...entitlements.create({
			id: `entitlement_${id}`,
			featureId: "messages",
			featureName: "Messages",
			allowance: 500,
			interval: EntInterval.Month,
		}),
		pooled: true,
	};

	return products.createFull({ id, entitlements: [pooledEntitlement] });
};

const createPooledCustomerProduct = ({
	id,
	status = CusProductStatus.Active,
}: {
	id: string;
	status?: CusProductStatus;
}): FullCusProduct => {
	const product = createPooledProduct({ id: `product_${id}` });
	const entitlement = customerEntitlements.create({
		id: `customer_entitlement_${id}`,
		entitlementId: product.entitlements[0]!.id,
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 0,
		customerProductId: id,
		interval: EntInterval.Month,
		nextResetAt: Date.UTC(2027, 1, 1),
	});
	entitlement.entitlement = product.entitlements[0]!;
	entitlement.reset_cycle_anchor = NOW;

	return customerProducts.create({
		id,
		productId: product.id,
		product,
		customerEntitlements: [entitlement],
		internalEntityId: entity.internal_id,
		entityId: entity.id ?? undefined,
		status,
		startsAt: NOW,
	});
};

const createCancelPlan = ({
	currentCustomerProduct,
}: {
	currentCustomerProduct: FullCusProduct;
}): AutumnBillingPlan => ({
	customerId: "cus_test",
	insertCustomerProducts: [],
	updateCustomerProduct: {
		customerProduct: currentCustomerProduct,
		updates: {},
	},
});

describe("pooled cancellation successors", () => {
	test("an immediate entity default is normalized and funded in the cancellation plan", () => {
		const outgoingCustomerProduct = createPooledCustomerProduct({
			id: "outgoing",
		});
		const defaultProduct = createPooledProduct({ id: "entity_default" });
		defaultProduct.is_default = true;
		const fullCustomer = customers.create({
			customerProducts: [outgoingCustomerProduct],
		});
		fullCustomer.entities = [entity];

		const result = computeCancelPlan({
			ctx: contexts.create({
				features: [defaultProduct.entitlements[0]!.feature],
			}),
			billingContext: {
				cancelAction: "cancel_immediately",
				customerProduct: outgoingCustomerProduct,
				defaultProduct,
				fullCustomer,
				currentEpochMs: NOW,
				billingCycleAnchorMs: NOW,
				refundLastPayment: "full",
				skipBillingChanges: true,
			} as never,
			plan: createCancelPlan({
				currentCustomerProduct: outgoingCustomerProduct,
			}),
		});

		expect(
			result.insertCustomerProducts[0]?.customer_entitlements[0]?.balance,
		).toBe(0);
		expect(result.pooledBalanceOps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					op: "remove_source",
					sourceCustomerProductId: outgoingCustomerProduct.id,
				}),
				expect.objectContaining({
					op: "upsert_source",
					sourceCustomerProductId: result.insertCustomerProducts[0]?.id,
					currentCycleContribution: 500,
				}),
			]),
		);
	});

	test("canceling a revert trial reactivates and re-funds the previous pooled source", () => {
		const previousCustomerProduct = createPooledCustomerProduct({
			id: "previous",
			status: CusProductStatus.Paused,
		});
		const trialCustomerProduct = customerProducts.create({
			id: "trial",
			productId: "trial_product",
			internalEntityId: entity.internal_id,
			entityId: entity.id ?? undefined,
			status: CusProductStatus.Active,
			startsAt: NOW,
		});
		trialCustomerProduct.on_trial_end = "revert";
		trialCustomerProduct.previous_customer_product_id =
			previousCustomerProduct.id;
		const fullCustomer = customers.create({
			customerProducts: [trialCustomerProduct, previousCustomerProduct],
		});
		fullCustomer.entities = [entity];

		const result = computeCancelPlan({
			ctx: contexts.create({
				features: [
					previousCustomerProduct.customer_entitlements[0]!.entitlement.feature,
				],
			}),
			billingContext: {
				cancelAction: "cancel_immediately",
				customerProduct: trialCustomerProduct,
				fullCustomer,
				currentEpochMs: NOW,
				billingCycleAnchorMs: NOW,
				refundLastPayment: "full",
				skipBillingChanges: true,
			} as never,
			plan: createCancelPlan({ currentCustomerProduct: trialCustomerProduct }),
		});

		expect(result.updateCustomerProducts).toEqual([
			expect.objectContaining({
				customerProduct: previousCustomerProduct,
				updates: { status: CusProductStatus.Active },
			}),
		]);
		expect(result.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				sourceCustomerProductId: previousCustomerProduct.id,
				currentCycleContribution: 500,
			}),
		]);
	});

	test("automatic revert expiry uses the same pooled restore operation", () => {
		const previousCustomerProduct = createPooledCustomerProduct({
			id: "previous_automatic",
			status: CusProductStatus.Paused,
		});
		const trialCustomerProduct = customerProducts.create({
			id: "trial_automatic",
			productId: "trial_product",
			internalEntityId: entity.internal_id,
			entityId: entity.id ?? undefined,
			status: CusProductStatus.Active,
			startsAt: NOW,
		});
		const fullCustomer = customers.create({
			customerProducts: [trialCustomerProduct, previousCustomerProduct],
		});
		fullCustomer.entities = [entity];

		const result = computeRevertTrialExpiryPlan({
			fullCustomer,
			trialCustomerProduct,
			previousCustomerProduct,
			now: NOW,
		});

		expect(result.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				sourceCustomerProductId: previousCustomerProduct.id,
				currentCycleContribution: 500,
			}),
		]);
	});
});
