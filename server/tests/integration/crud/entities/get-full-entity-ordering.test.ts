import { expect, test } from "bun:test";
import { type Entity, type FullCusProduct } from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("get-full: entity-scoped cusProducts ordered before customer-level when entityId passed")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const creditsItem = items.monthlyCredits({ includedUsage: 50 });

		const customerProd = products.pro({
			id: "cus-level-prod",
			items: [messagesItem],
		});
		const entityProd = products.base({
			id: "ent-level-prod",
			items: [creditsItem],
		});

		const { customerId, ctx, entities } = await initScenario({
			customerId: "get-full-entity-ordering",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [customerProd, entityProd] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: customerProd.id }),
				s.attach({ productId: entityProd.id, entityIndex: 0 }),
				s.attach({ productId: entityProd.id, entityIndex: 1 }),
			],
		});

		const fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			entityId: entities[0].id,
			withEntities: true,
		});

		const cusProducts = fullCus.customer_products as FullCusProduct[];
		expect(cusProducts.length).toBeGreaterThanOrEqual(2);

		const entityScopedProducts = cusProducts.filter(
			(cp) => cp.entity_id === entities[0].id,
		);
		const customerLevelProducts = cusProducts.filter(
			(cp) => !cp.entity_id,
		);

		expect(entityScopedProducts.length).toBeGreaterThan(0);
		expect(customerLevelProducts.length).toBeGreaterThan(0);

		const firstEntityScopedIndex = cusProducts.findIndex(
			(cp) => cp.entity_id === entities[0].id,
		);
		const firstCustomerLevelIndex = cusProducts.findIndex(
			(cp) => !cp.entity_id,
		);

		expect(firstEntityScopedIndex).toBeLessThan(firstCustomerLevelIndex);
	},
);

test.concurrent(
	`${chalk.yellowBright("get-full: entity-scoped cusProducts ordered first when internal entityId passed")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const creditsItem = items.monthlyCredits({ includedUsage: 50 });

		const customerProd = products.pro({
			id: "cus-level-internal",
			items: [messagesItem],
		});
		const entityProd = products.base({
			id: "ent-level-internal",
			items: [creditsItem],
		});

		const { customerId, ctx, entities } = await initScenario({
			customerId: "get-full-entity-ordering-internal",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [customerProd, entityProd] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: customerProd.id }),
				s.attach({ productId: entityProd.id, entityIndex: 0 }),
				s.attach({ productId: entityProd.id, entityIndex: 1 }),
			],
		});

		const baseCus = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const targetInternalId = (baseCus.entities as Entity[]).find(
			(e) => e.id === entities[0].id,
		)?.internal_id;
		expect(targetInternalId).toBeDefined();

		const fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			entityId: targetInternalId!,
			withEntities: true,
		});

		const cusProducts = fullCus.customer_products as FullCusProduct[];
		expect(cusProducts.length).toBeGreaterThanOrEqual(2);

		const firstEntityIndex = cusProducts.findIndex(
			(cp) => cp.internal_entity_id === targetInternalId,
		);
		const firstCustomerIndex = cusProducts.findIndex(
			(cp) => !cp.entity_id && !cp.internal_entity_id,
		);

		expect(firstEntityIndex).toBeGreaterThanOrEqual(0);
		expect(firstCustomerIndex).toBeGreaterThanOrEqual(0);
		expect(firstEntityIndex).toBeLessThan(firstCustomerIndex);
	},
);
