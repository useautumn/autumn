import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import {
	findExistingTransferTargetProduct,
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
	group = product.group,
}: {
	id: string;
	productId?: string;
	internalEntityId?: string | null;
	status?: CusProductStatus;
	group?: string | null;
}) =>
	({
		id,
		internal_entity_id: internalEntityId,
		product_id: productId,
		status,
		product: {
			id: productId,
			group,
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

	test("targets only the selected customer product when an id is provided", () => {
		const results = getTransferCustomerProducts({
			fullCustomer,
			fromEntity: sourceEntity,
			product,
			customerProductId: "cus_prod_target",
		});

		expect(results.map((customerProduct) => customerProduct.id)).toEqual([
			"cus_prod_target",
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

describe("transfer target collision", () => {
	const targetEntity = {
		id: "entity_public_2",
		internal_id: "entity_internal_2",
	} as Entity;

	const scheduledSource = createCustomerProduct({
		id: "cus_prod_scheduled",
		status: CusProductStatus.Scheduled,
	});
	const activeAtTarget = createCustomerProduct({
		id: "cus_prod_target_active",
		internalEntityId: targetEntity.internal_id,
	});
	const scheduledAtTarget = createCustomerProduct({
		id: "cus_prod_target_scheduled",
		internalEntityId: targetEntity.internal_id,
		status: CusProductStatus.Scheduled,
	});

	test("a scheduled transfer is not blocked by an active product at the target", () => {
		const result = findExistingTransferTargetProduct({
			fullCustomer: {
				customer_products: [scheduledSource, activeAtTarget],
			} as FullCustomer,
			toEntity: targetEntity,
			transferringCustomerProducts: [scheduledSource],
		});

		expect(result).toBeUndefined();
	});

	test("a scheduled transfer still collides with a scheduled product at the target", () => {
		const result = findExistingTransferTargetProduct({
			fullCustomer: {
				customer_products: [scheduledSource, activeAtTarget, scheduledAtTarget],
			} as FullCustomer,
			toEntity: targetEntity,
			transferringCustomerProducts: [scheduledSource],
		});

		expect(result?.id).toBe("cus_prod_target_scheduled");
	});

	test("an active transfer still collides with an active product at the target", () => {
		const activeSource = createCustomerProduct({ id: "cus_prod_active" });

		const result = findExistingTransferTargetProduct({
			fullCustomer: {
				customer_products: [activeSource, scheduledAtTarget, activeAtTarget],
			} as FullCustomer,
			toEntity: targetEntity,
			transferringCustomerProducts: [activeSource],
		});

		expect(result?.id).toBe("cus_prod_target_active");
	});

	test("a cross-group scheduled successor collides at the target", () => {
		const scheduledSuccessor = createCustomerProduct({
			id: "cus_prod_successor",
			productId: "premium",
			group: "premium",
			status: CusProductStatus.Scheduled,
		});
		const scheduledSuccessorAtTarget = createCustomerProduct({
			id: "cus_prod_target_successor",
			productId: "premium-target",
			group: "premium",
			internalEntityId: targetEntity.internal_id,
			status: CusProductStatus.Scheduled,
		});

		const result = findExistingTransferTargetProduct({
			fullCustomer: {
				customer_products: [scheduledSuccessor, scheduledSuccessorAtTarget],
			} as FullCustomer,
			toEntity: targetEntity,
			transferringCustomerProducts: [scheduledSuccessor],
		});

		expect(result?.id).toBe("cus_prod_target_successor");
	});
});
