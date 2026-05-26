import { describe, expect, test } from "bun:test";
import type { Entity, FullCusProduct } from "@autumn/shared";

const makeProduct = (overrides: Partial<FullCusProduct> = {}): FullCusProduct =>
	({
		id: "cp-1",
		entity_id: null,
		internal_entity_id: null,
		...overrides,
	}) as unknown as FullCusProduct;

const makeEntity = (overrides: Partial<Entity> = {}): Entity =>
	({
		id: "ent-1",
		internal_id: "int-ent-1",
		...overrides,
	}) as unknown as Entity;

function filterBySelectedEntity({
	products,
	entityId,
	entities,
}: {
	products: FullCusProduct[];
	entityId: string | null;
	entities: Entity[];
}): FullCusProduct[] {
	if (!entityId) return products;

	const selectedEntity = entities.find(
		(e: Entity) => e.id === entityId || e.internal_id === entityId,
	);
	if (!selectedEntity) return products;

	return products.filter(
		(product) =>
			(!product.internal_entity_id && !product.entity_id) ||
			product.internal_entity_id === selectedEntity.internal_id ||
			product.entity_id === selectedEntity.id,
	);
}

describe("filterBySelectedEntity", () => {
	const entity = makeEntity({ id: "ent-1", internal_id: "int-ent-1" });
	const otherEntity = makeEntity({ id: "ent-2", internal_id: "int-ent-2" });
	const entities = [entity, otherEntity];

	test("returns all products when no entityId", () => {
		const products = [
			makeProduct({ id: "cp-1" }),
			makeProduct({ id: "cp-2", entity_id: "ent-1" }),
		];
		const result = filterBySelectedEntity({
			products,
			entityId: null,
			entities,
		});
		expect(result).toHaveLength(2);
	});

	test("includes customer-level products (no entity)", () => {
		const customerProduct = makeProduct({ id: "cp-cus" });
		const entityProduct = makeProduct({
			id: "cp-ent",
			entity_id: "ent-1",
			internal_entity_id: "int-ent-1",
		});
		const result = filterBySelectedEntity({
			products: [customerProduct, entityProduct],
			entityId: "ent-1",
			entities,
		});
		expect(result).toContainEqual(customerProduct);
		expect(result).toContainEqual(entityProduct);
	});

	test("excludes products from other entities", () => {
		const otherEntityProduct = makeProduct({
			id: "cp-other",
			entity_id: "ent-2",
			internal_entity_id: "int-ent-2",
		});
		const result = filterBySelectedEntity({
			products: [otherEntityProduct],
			entityId: "ent-1",
			entities,
		});
		expect(result).toHaveLength(0);
	});

	test("does not leak products with only internal_entity_id set", () => {
		const leakyProduct = makeProduct({
			id: "cp-leak",
			entity_id: null,
			internal_entity_id: "int-ent-2",
		});
		const result = filterBySelectedEntity({
			products: [leakyProduct],
			entityId: "ent-1",
			entities,
		});
		expect(result).toHaveLength(0);
	});

	test("matches by internal_id when entity_id not set on product", () => {
		const internalOnlyProduct = makeProduct({
			id: "cp-internal",
			entity_id: null,
			internal_entity_id: "int-ent-1",
		});
		const result = filterBySelectedEntity({
			products: [internalOnlyProduct],
			entityId: "ent-1",
			entities,
		});
		expect(result).toHaveLength(1);
	});

	test("returns all products when entityId does not match any entity", () => {
		const products = [
			makeProduct({ id: "cp-1" }),
			makeProduct({ id: "cp-2", entity_id: "ent-1" }),
		];
		const result = filterBySelectedEntity({
			products,
			entityId: "nonexistent",
			entities,
		});
		expect(result).toHaveLength(2);
	});
});
