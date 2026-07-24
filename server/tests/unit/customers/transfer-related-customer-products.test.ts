import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import {
	findTransferCustomerProduct,
	getTransferCustomerProducts,
} from "@/internal/customers/handlers/handleTransferProduct/transferRelatedCustomerProducts.js";

const sourceEntity = {
	id: "entity_public_1",
	internal_id: "entity_internal_1",
} as Entity;

const product = {
	id: "pro",
	group: "main",
	is_add_on: false,
};

const createCustomerProduct = ({
	id,
	productId = product.id,
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
		product: {
			id: productId,
			group: product.group,
			is_add_on: product.is_add_on,
		},
	}) as FullCusProduct;

const fullCustomer = {
	customer_products: [
		createCustomerProduct({ id: "cus_prod_target" }),
		createCustomerProduct({
			id: "cus_prod_related",
			status: CusProductStatus.Scheduled,
		}),
		createCustomerProduct({ id: "cus_prod_other_active" }),
		createCustomerProduct({
			id: "cus_prod_other_scope",
			internalEntityId: "entity_internal_2",
		}),
	],
} as FullCustomer;

describe("transfer customer product selection", () => {
	test("finds the exact customer product when an id is provided", () => {
		const result = findTransferCustomerProduct({
			fullCustomer,
			fromEntity: sourceEntity,
			productId: product.id,
			customerProductId: "cus_prod_related",
		});

		expect(result?.id).toBe("cus_prod_related");
	});

	test("targets the selected product and its scheduled successors", () => {
		const results = getTransferCustomerProducts({
			fullCustomer,
			fromEntity: sourceEntity,
			product,
			customerProductId: "cus_prod_target",
		});

		expect(results.map((customerProduct) => customerProduct.id)).toEqual([
			"cus_prod_target",
			"cus_prod_related",
		]);
	});

	test("keeps legacy related-product selection when no id is provided", () => {
		const results = getTransferCustomerProducts({
			fullCustomer,
			fromEntity: sourceEntity,
			product,
		});

		expect(results.map((customerProduct) => customerProduct.id)).toEqual([
			"cus_prod_target",
			"cus_prod_related",
			"cus_prod_other_active",
		]);
	});
});
