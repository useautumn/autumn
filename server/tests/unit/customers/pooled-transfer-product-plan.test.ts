import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import {
	computePooledFullTransferPlan,
	computePooledSplitTransferPlan,
} from "@/internal/customers/handlers/handleTransferProduct/computePooledTransferPlan.js";
import { handlePooledFullTransfer } from "@/internal/customers/handlers/handleTransferProduct/handlePooledFullTransfer.js";

const NOW = Date.UTC(2027, 0, 1);

const createPooledCustomerProduct = ({
	id,
	entityAttached,
	quantity = 1,
	balance,
}: {
	id: string;
	entityAttached: boolean;
	quantity?: number;
	balance: number;
}): FullCusProduct => {
	const customerEntitlement = customerEntitlements.create({
		id: `customer-entitlement-${id}`,
		entitlementId: `entitlement-${id}`,
		featureId: "messages",
		internalFeatureId: "internal-messages",
		featureName: "Messages",
		allowance: 500,
		balance,
		customerProductId: id,
		interval: EntInterval.Month,
		nextResetAt: NOW + 2_592_000_000,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};
	customerEntitlement.reset_cycle_anchor = NOW;

	const customerProduct = customerProducts.create({
		id,
		productId: "pooled-transfer-plan",
		customerEntitlements: [customerEntitlement],
		internalEntityId: entityAttached ? "internal-entity-source" : undefined,
		entityId: entityAttached ? "entity-source" : undefined,
		status: CusProductStatus.Active,
		startsAt: NOW,
	});
	customerProduct.quantity = quantity;
	return customerProduct;
};

const createFullCustomer = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): FullCustomer => {
	const sourceEntity = entities.create({
		id: "entity-source",
		featureId: "users",
	});
	sourceEntity.internal_id = "internal-entity-source";
	const destinationEntity = entities.create({
		id: "entity-destination",
		featureId: "users",
	});
	destinationEntity.internal_id = "internal-entity-destination";

	return {
		...customers.create({ customerProducts: [customerProduct] }),
		created_at: NOW - 86_400_000,
		entities: [sourceEntity, destinationEntity],
	};
};

describe("pooled customer-product transfer planning", () => {
	test("customer to entity creates a managed source and reapplies ordinary usage", () => {
		const customerProduct = createPooledCustomerProduct({
			id: "customer-to-entity",
			entityAttached: false,
			balance: 400,
		});
		const fullCustomer = createFullCustomer({ customerProduct });
		const destinationEntity = fullCustomer.entities[1]!;

		const plan = computePooledFullTransferPlan({
			fullCustomer,
			customerProduct,
			toEntity: destinationEntity,
			now: NOW,
		});

		expect(plan.updatedCustomerProduct.internal_entity_id).toBe(
			destinationEntity.internal_id,
		);
		expect(plan.updatedCustomerProduct.customer_entitlements[0]?.balance).toBe(
			0,
		);
		expect(plan.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				currentCycleContribution: 500,
				nextCycleContribution: 500,
				usageReapply: {
					amount: 100,
					excludedSourceCustomerProductId: customerProduct.id,
				},
			}),
		]);
		expect(plan.restoreOrdinaryCustomerEntitlements).toEqual([]);
	});

	test("entity to customer removes the source and restores a fresh ordinary grant", () => {
		const customerProduct = createPooledCustomerProduct({
			id: "entity-to-customer",
			entityAttached: true,
			balance: 0,
		});
		const fullCustomer = createFullCustomer({ customerProduct });

		const plan = computePooledFullTransferPlan({
			fullCustomer,
			customerProduct,
			toEntity: null,
			now: NOW,
		});

		expect(plan.updatedCustomerProduct.internal_entity_id).toBeNull();
		expect(plan.pooledBalanceOps).toEqual([
			{
				op: "remove_source",
				internalCustomerId: customerProduct.internal_customer_id,
				sourceCustomerProductId: customerProduct.id,
				effectiveAt: null,
			},
		]);
		expect(plan.restoreOrdinaryCustomerEntitlements).toEqual([
			{
				customerEntitlementId: customerProduct.customer_entitlements[0]?.id,
				balance: 500,
				adjustment: 0,
				additionalBalance: 0,
			},
		]);
	});

	test("entity to entity keeps the existing shared contribution", () => {
		const customerProduct = createPooledCustomerProduct({
			id: "entity-to-entity",
			entityAttached: true,
			balance: 0,
		});
		const fullCustomer = createFullCustomer({ customerProduct });
		const destinationEntity = fullCustomer.entities[1]!;

		const plan = computePooledFullTransferPlan({
			fullCustomer,
			customerProduct,
			toEntity: destinationEntity,
			now: NOW,
		});

		expect(plan.updatedCustomerProduct.internal_entity_id).toBe(
			destinationEntity.internal_id,
		);
		expect(plan.pooledBalanceOps).toEqual([]);
		expect(plan.restoreOrdinaryCustomerEntitlements).toEqual([]);
	});

	test("entity to entity split resizes the original source and inserts one new source", () => {
		const customerProduct = createPooledCustomerProduct({
			id: "entity-to-entity-split",
			entityAttached: true,
			quantity: 3,
			balance: 0,
		});
		const fullCustomer = createFullCustomer({ customerProduct });
		const destinationEntity = fullCustomer.entities[1]!;

		const plan = computePooledSplitTransferPlan({
			fullCustomer,
			customerProduct,
			toEntity: destinationEntity,
			now: NOW,
		});

		expect(plan.sourceQuantity).toBe(2);
		expect(plan.sourceOrdinaryBalanceDecrements).toEqual([]);
		expect(plan.transferredCustomerProduct).toMatchObject({
			quantity: 1,
			entity_id: destinationEntity.id,
			internal_entity_id: destinationEntity.internal_id,
		});
		expect(
			plan.transferredCustomerProduct.customer_entitlements[0]?.balance,
		).toBe(0);
		expect(
			plan.pooledBalanceOps.map((operation) => ({
				op: operation.op,
				sourceCustomerProductId:
					"sourceCustomerProductId" in operation
						? operation.sourceCustomerProductId
						: undefined,
				currentCycleContribution:
					operation.op === "upsert_source"
						? operation.currentCycleContribution
						: undefined,
			})),
		).toEqual([
			{
				op: "upsert_source",
				sourceCustomerProductId: customerProduct.id,
				currentCycleContribution: 1000,
			},
			{
				op: "upsert_source",
				sourceCustomerProductId: plan.transferredCustomerProduct.id,
				currentCycleContribution: 500,
			},
		]);
	});

	test("entity to customer split leaves history shared and gives the split product a grant", () => {
		const customerProduct = createPooledCustomerProduct({
			id: "entity-to-customer-split",
			entityAttached: true,
			quantity: 3,
			balance: 0,
		});
		const fullCustomer = createFullCustomer({ customerProduct });

		const plan = computePooledSplitTransferPlan({
			fullCustomer,
			customerProduct,
			toEntity: null,
			now: NOW,
		});

		expect(plan.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				sourceCustomerProductId: customerProduct.id,
				currentCycleContribution: 1000,
			}),
		]);
		expect(plan.transferredCustomerProduct.internal_entity_id).toBeNull();
		expect(
			plan.transferredCustomerProduct.customer_entitlements[0],
		).toMatchObject({
			balance: 500,
			adjustment: 0,
			additional_balance: 0,
		});
	});

	test("customer to entity split keeps prior ordinary usage on the remaining quantity", () => {
		const customerProduct = createPooledCustomerProduct({
			id: "customer-to-entity-split",
			entityAttached: false,
			quantity: 3,
			balance: 1400,
		});
		const fullCustomer = createFullCustomer({ customerProduct });
		const destinationEntity = fullCustomer.entities[1]!;

		const plan = computePooledSplitTransferPlan({
			fullCustomer,
			customerProduct,
			toEntity: destinationEntity,
			now: NOW,
		});

		expect(plan.sourceOrdinaryBalanceDecrements).toEqual([
			{
				customerEntitlementId: customerProduct.customer_entitlements[0]?.id,
				amount: 500,
			},
		]);
		expect(plan.pooledBalanceOps).toEqual([
			expect.objectContaining({
				op: "upsert_source",
				sourceCustomerProductId: plan.transferredCustomerProduct.id,
				currentCycleContribution: 500,
			}),
		]);
		expect(plan.pooledBalanceOps[0]).not.toHaveProperty("usageReapply");
	});

	test("a group transfer prepares every related pooled customer product", async () => {
		const firstCustomerProduct = createPooledCustomerProduct({
			id: "group-source-one",
			entityAttached: false,
			balance: 500,
		});
		const secondCustomerProduct = createPooledCustomerProduct({
			id: "group-source-two",
			entityAttached: false,
			balance: 500,
		});
		for (const customerProduct of [
			firstCustomerProduct,
			secondCustomerProduct,
		]) {
			customerProduct.product.group = "shared-group";
			customerProduct.product.is_add_on = false;
			customerProduct.starts_at = Date.now() - 86_400_000;
		}
		const fullCustomer = createFullCustomer({
			customerProduct: firstCustomerProduct,
		});
		fullCustomer.customer_products = [
			firstCustomerProduct,
			secondCustomerProduct,
		];
		const destinationEntity = fullCustomer.entities[1]!;
		const operationSourceIds: string[] = [];
		const updatedEntitlementIds: string[] = [];

		await handlePooledFullTransfer({
			ctx: {} as never,
			fullCustomer,
			fromEntity: null,
			toEntity: destinationEntity,
			product: {
				id: firstCustomerProduct.product.id,
				group: "shared-group",
				is_add_on: false,
			},
			customerProduct: firstCustomerProduct,
			dependencies: {
				executePooledBalanceOps: async ({
					pooledBalanceOps,
					beforeRebalance,
					afterRebalance,
				}) => {
					operationSourceIds.push(
						...(pooledBalanceOps ?? []).flatMap((operation) =>
							"sourceCustomerProductId" in operation
								? [operation.sourceCustomerProductId]
								: [],
						),
					);
					await beforeRebalance?.({ db: {} as never });
					await afterRebalance?.({ db: {} as never });
				},
				transferRelatedCustomerProducts: async () => ({
					entity_id: destinationEntity.id,
					internal_entity_id: destinationEntity.internal_id,
				}),
				updateCustomerEntitlement: async ({ id, updates }) => {
					expect(updates.balance).toBe(0);
					updatedEntitlementIds.push(id);
					return [] as never;
				},
			},
		});

		expect(operationSourceIds).toEqual([
			firstCustomerProduct.id,
			secondCustomerProduct.id,
		]);
		expect(updatedEntitlementIds).toEqual([
			firstCustomerProduct.customer_entitlements[0]!.id,
			secondCustomerProduct.customer_entitlements[0]!.id,
		]);
	});

	test("a scheduled customer-to-entity transfer persists normalized pooled rows even with no pooled operations", async () => {
		const customerProduct = createPooledCustomerProduct({
			id: "scheduled-group-source",
			entityAttached: false,
			balance: 500,
		});
		customerProduct.status = CusProductStatus.Scheduled;
		customerProduct.product.group = "scheduled-group";
		customerProduct.product.is_add_on = false;
		const fullCustomer = createFullCustomer({ customerProduct });
		const destinationEntity = fullCustomer.entities[1]!;
		let operationCount = -1;
		const updatedEntitlementIds: string[] = [];

		await handlePooledFullTransfer({
			ctx: {} as never,
			fullCustomer,
			fromEntity: null,
			toEntity: destinationEntity,
			product: {
				id: customerProduct.product.id,
				group: "scheduled-group",
				is_add_on: false,
			},
			customerProduct,
			dependencies: {
				executePooledBalanceOps: async ({
					pooledBalanceOps,
					beforeRebalance,
				}) => {
					operationCount = pooledBalanceOps?.length ?? 0;
					await beforeRebalance?.({ db: {} as never });
				},
				transferRelatedCustomerProducts: async () => ({
					entity_id: destinationEntity.id,
					internal_entity_id: destinationEntity.internal_id,
				}),
				updateCustomerEntitlement: async ({ id, updates }) => {
					expect(updates.balance).toBe(0);
					updatedEntitlementIds.push(id);
					return [] as never;
				},
			},
		});

		expect(operationCount).toBe(0);
		expect(updatedEntitlementIds).toEqual([
			customerProduct.customer_entitlements[0]!.id,
		]);
	});
});
