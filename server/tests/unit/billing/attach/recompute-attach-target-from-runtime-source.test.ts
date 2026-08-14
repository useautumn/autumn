import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { recomputeAttachTargetFromRuntimeSource } from "@/internal/billing/v2/execute/attachBalanceHandoff/recomputeAttachTargetFromRuntimeSource.js";

describe("attach runtime balance handoff", () => {
	for (const entityScoped of [false, true]) {
		test(`rebuilds ${entityScoped ? "entity" : "customer"} usage without changing planned ids`, () => {
			const sourceCustomerEntitlement = customerEntitlements.create({
				id: "source_messages",
				customerProductId: "source_product",
				featureId: "messages",
				featureName: "Messages",
				allowance: 100,
				balance: entityScoped ? 0 : 95,
				entityFeatureId: entityScoped ? "seats" : null,
				entities: entityScoped
					? { entity: { id: "entity", balance: 95, adjustment: 0 } }
					: null,
			});
			const targetCustomerEntitlement = customerEntitlements.create({
				id: "stable_target_entitlement",
				customerProductId: "stable_target_product",
				featureId: "messages",
				featureName: "Messages",
				allowance: 200,
				balance: entityScoped ? 0 : 195,
				entityFeatureId: entityScoped ? "seats" : null,
			});
			const sourceProduct = customerProducts.create({
				id: "source_product",
				productId: "pro",
				status: CusProductStatus.Expired,
				customerEntitlements: [sourceCustomerEntitlement],
				product: products.createFull({
					id: "pro",
					entitlements: [sourceCustomerEntitlement.entitlement],
				}),
			});
			const targetProduct = customerProducts.create({
				id: "stable_target_product",
				productId: "premium",
				customerEntitlements: [targetCustomerEntitlement],
				product: products.createFull({
					id: "premium",
					entitlements: [targetCustomerEntitlement.entitlement],
				}),
			});
			const fullCustomer = customers.create({
				customerProducts: [sourceProduct, targetProduct],
			});
			if (entityScoped) {
				const entity = entities.create({ id: "entity", featureId: "seats" });
				fullCustomer.entity = entity;
				fullCustomer.entities = [entity];
			}

			const result = recomputeAttachTargetFromRuntimeSource({
				ctx: contexts.create({
					features: [sourceCustomerEntitlement.entitlement.feature],
				}),
				fullCustomer,
				sourceCustomerProduct: sourceProduct,
				targetCustomerProduct: targetProduct,
				plannedTargetCustomerProduct: targetProduct,
				carryAllConsumableFeatures: true,
			});

			expect(result.id).toBe("stable_target_product");
			expect(result.customer_entitlements[0]?.id).toBe(
				"stable_target_entitlement",
			);
			expect(
				entityScoped
					? result.customer_entitlements[0]?.entities?.entity?.balance
					: result.customer_entitlements[0]?.balance,
			).toBe(195);
		});
	}
});
