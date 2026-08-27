import { describe, expect, test } from "bun:test";
import type { Entity, FullCusProduct } from "@autumn/shared";
import { compactCustomerProduct } from "@/internal/billing/v2/actions/generateRequest/setup/setupGenerationContext";

const entities = [
	{ id: "alpha", internal_id: "ent_internal_alpha", name: "Alpha" },
	{ id: "beta", internal_id: "ent_internal_beta", name: "Beta" },
] as unknown as Entity[];

describe("compactCustomerProduct", () => {
	test("an entity-scoped product carries its public entity id", () => {
		const compact = compactCustomerProduct({
			customerProduct: {
				id: "cp_1",
				internal_entity_id: "ent_internal_beta",
				product: { id: "scale" },
				status: "active",
			} as unknown as FullCusProduct,
			entities,
		});
		expect(compact.entity_id).toBe("beta");
		expect(compact.customer_product_id).toBe("cp_1");
		expect(compact.plan_id).toBe("scale");
	});

	test("a customer-level product has no entity_id", () => {
		const compact = compactCustomerProduct({
			customerProduct: {
				id: "cp_2",
				internal_entity_id: null,
				product: { id: "pro" },
				status: "active",
			} as unknown as FullCusProduct,
			entities,
		});
		expect(compact.entity_id).toBeUndefined();
		expect("entity_id" in compact).toBe(false);
		expect(compact.plan_id).toBe("pro");
	});

	test("an unknown internal entity id degrades to no entity_id", () => {
		const compact = compactCustomerProduct({
			customerProduct: {
				id: "cp_3",
				internal_entity_id: "ent_internal_missing",
				product: { id: "pro" },
				status: "active",
			} as unknown as FullCusProduct,
			entities: [],
		});
		expect(compact.entity_id).toBeUndefined();
	});
});
