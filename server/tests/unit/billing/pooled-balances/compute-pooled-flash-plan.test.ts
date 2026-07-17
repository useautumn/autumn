import { describe, expect, test } from "bun:test";
import { CusProductStatus, EntInterval } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import { entitlements } from "@tests/utils/fixtures/db/entitlements.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { computeFlashPlan } from "@/internal/billing/v2/actions/dfu/compute/computeFlashPlan.js";
import type {
	FlashContext,
	FlashPlanContext,
} from "@/internal/billing/v2/actions/dfu/setup/setupFlashContext.js";

const CURRENT_EPOCH_MS = Date.UTC(2027, 0, 1);

const createPooledProduct = ({
	id,
	allowance,
}: {
	id: string;
	allowance: number;
}) => {
	const entitlement = {
		...entitlements.create({
			id: `entitlement_${id}`,
			featureId: "messages",
			featureName: "Messages",
			allowance,
			interval: EntInterval.Month,
		}),
		pooled: true,
	};
	return products.createFull({ id, entitlements: [entitlement] });
};

const createPlanContext = ({
	fullProduct,
	internalEntityId,
	status = "active",
}: {
	fullProduct: ReturnType<typeof createPooledProduct>;
	internalEntityId: string;
	status?: "active" | "expired";
}): FlashPlanContext => ({
	plan: { plan_id: fullProduct.id, status },
	processor: undefined,
	fullProduct,
	featureQuantities: [],
	subscriptionIds: [],
	isAddOn: false,
	isRecurring: true,
	entityId: "entity_one",
	internalEntityId,
});

const createFlashContext = ({
	planContext,
	currentCustomerProduct,
}: {
	planContext: FlashPlanContext;
	currentCustomerProduct?: ReturnType<typeof customerProducts.create>;
}): FlashContext => {
	const entity = entities.create({ id: "entity_one", featureId: "seats" });
	const fullCustomer = customers.create({
		customerProducts: currentCustomerProduct ? [currentCustomerProduct] : [],
	});
	fullCustomer.entities = [entity];

	return {
		customer_id: fullCustomer.id ?? fullCustomer.internal_id,
		fullCustomer,
		currentEpochMs: CURRENT_EPOCH_MS,
		dryRun: false,
		params: {
			customer_id: fullCustomer.id ?? fullCustomer.internal_id,
			billables: [],
			entities: [
				{
					entity_id: entity.id ?? "entity_one",
					billables: [],
				},
			],
		},
		planContexts: [planContext],
	};
};

describe("pooled DFU plans", () => {
	test("active imports upsert the new source and remove an expired source", () => {
		const entity = entities.create({ id: "entity_one", featureId: "seats" });
		const oldProduct = createPooledProduct({
			id: "pooled_starter",
			allowance: 100,
		});
		const oldCustomerEntitlement = customerEntitlements.create({
			id: "customer_entitlement_old",
			entitlementId: oldProduct.entitlements[0]!.id,
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			balance: 40,
			customerProductId: "customer_product_old",
			interval: EntInterval.Month,
			nextResetAt: CURRENT_EPOCH_MS + 86_400_000,
		});
		oldCustomerEntitlement.entitlement = oldProduct.entitlements[0]!;
		oldCustomerEntitlement.reset_cycle_anchor = CURRENT_EPOCH_MS;
		const oldCustomerProduct = customerProducts.create({
			id: "customer_product_old",
			productId: oldProduct.id,
			product: oldProduct,
			customerEntitlements: [oldCustomerEntitlement],
			internalEntityId: entity.internal_id,
			entityId: entity.id ?? undefined,
			status: CusProductStatus.Active,
		});
		const newProduct = createPooledProduct({
			id: "pooled_pro",
			allowance: 500,
		});
		const flashContext = createFlashContext({
			planContext: createPlanContext({
				fullProduct: newProduct,
				internalEntityId: entity.internal_id,
			}),
			currentCustomerProduct: oldCustomerProduct,
		});

		const result = computeFlashPlan({
			ctx: contexts.create({}),
			flashContext,
		});
		const insertedCustomerProduct =
			result.autumnBillingPlan.insertCustomerProducts[0];

		expect(insertedCustomerProduct?.customer_entitlements[0]?.balance).toBe(0);
		expect(result.autumnBillingPlan.pooledBalanceOps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					op: "upsert_source",
					sourceCustomerProductId: insertedCustomerProduct?.id,
					currentCycleContribution: 500,
				}),
				expect.objectContaining({
					op: "remove_source",
					sourceCustomerProductId: oldCustomerProduct.id,
				}),
			]),
		);
	});

	test("expired historical imports are zeroed without contributing", () => {
		const entity = entities.create({ id: "entity_one", featureId: "seats" });
		const product = createPooledProduct({
			id: "pooled_historical",
			allowance: 500,
		});
		const flashContext = createFlashContext({
			planContext: createPlanContext({
				fullProduct: product,
				internalEntityId: entity.internal_id,
				status: "expired",
			}),
		});

		const result = computeFlashPlan({
			ctx: contexts.create({}),
			flashContext,
		});

		expect(
			result.autumnBillingPlan.insertCustomerProducts[0]
				?.customer_entitlements[0]?.balance,
		).toBe(0);
		expect(result.autumnBillingPlan.pooledBalanceOps).toEqual([]);
	});
});
