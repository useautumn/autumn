import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { findTransferCustomerProduct } from "@/internal/customers/handlers/handleTransferProduct/findTransferCustomerProduct.js";

const sourceEntity = {
	id: "entity_public_1",
	internal_id: "entity_internal_1",
} as Entity;

const createCustomerProduct = ({
	id,
	productId = "pro",
	internalEntityId = sourceEntity.internal_id,
	status = CusProductStatus.Active,
}: {
	id: string;
	productId?: string;
	internalEntityId?: string | null;
	status?: CusProductStatus;
}) =>
	({
		id,
		internal_entity_id: internalEntityId,
		product_id: productId,
		status,
		product: { id: productId, group: "main", is_add_on: false },
	}) as FullCusProduct;

const fullCustomer = {
	customer_products: [
		createCustomerProduct({
			id: "cus_prod_scheduled",
			status: CusProductStatus.Scheduled,
		}),
		createCustomerProduct({ id: "cus_prod_active" }),
		createCustomerProduct({
			id: "cus_prod_other_scope",
			internalEntityId: "entity_internal_2",
		}),
	],
} as FullCustomer;

describe("findTransferCustomerProduct", () => {
	test("returns the exact customer product when an id is provided", () => {
		const result = findTransferCustomerProduct({
			fullCustomer,
			fromEntity: sourceEntity,
			productId: "pro",
			customerProductId: "cus_prod_scheduled",
		});

		expect(result?.id).toBe("cus_prod_scheduled");
	});

	test("prefers the active row when no id is provided", () => {
		const result = findTransferCustomerProduct({
			fullCustomer,
			fromEntity: sourceEntity,
			productId: "pro",
		});

		expect(result?.id).toBe("cus_prod_active");
	});

	test("ignores rows outside the source scope", () => {
		const result = findTransferCustomerProduct({
			fullCustomer,
			fromEntity: sourceEntity,
			productId: "pro",
			customerProductId: "cus_prod_other_scope",
		});

		expect(result).toBeUndefined();
	});
});
