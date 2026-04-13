import { expect, test } from "bun:test";
import { type ApiEntityV0, CusProductStatus } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const getFullCustomerForDeleteEntityTest = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	return await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
};

test.concurrent(`${chalk.yellowBright("delete-entity: deleting one of two entity-scoped pro products keeps Stripe correct")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "delete-entity-pro",
		items: [messagesItem],
	});

	const customerId = "delete-entity-pro-two-entities";

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	await autumnV1.entities.delete(customerId, entities[0].id);

	const remainingEntity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: remainingEntity,
		productId: pro.id,
	});

	const fullCustomer = await getFullCustomerForDeleteEntityTest({
		ctx,
		customerId,
	});
	const remainingFullEntity = fullCustomer.entities.find(
		(entity) => entity.id === entities[1].id,
	);
	if (!remainingFullEntity) {
		throw new Error("Expected remaining entity to still exist after deletion");
	}

	expect(fullCustomer.entities.map((entity) => entity.id)).toEqual([
		entities[1].id,
	]);

	const remainingProProducts = fullCustomer.customer_products.filter(
		(customerProduct) => customerProduct.product.id === pro.id,
	);
	expect(remainingProProducts).toHaveLength(1);
	expect(remainingProProducts[0].status).toBe(CusProductStatus.Active);
	expect(remainingProProducts[0].internal_entity_id).toBe(
		remainingFullEntity.internal_id,
	);

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: {
			subCount: 1,
		},
	});
});

test.concurrent(`${chalk.yellowBright("delete-entity: downgrading one entity to pro while another is already on pro keeps Stripe correct")}`, async () => {
	const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "delete-entity-premium",
		items: [premiumMessages],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "delete-entity-pro-downgrade",
		items: [proMessages],
	});

	const customerId = "delete-entity-downgrade-one-entity";

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		},
		{
			timeout: 5000,
		},
	);

	const entityA = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entityB = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectProductCanceling({
		customer: entityA,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entityA,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entityB,
		productId: pro.id,
	});

	const fullCustomer = await getFullCustomerForDeleteEntityTest({
		ctx,
		customerId,
	});
	const entityAFull = fullCustomer.entities.find(
		(entity) => entity.id === entities[0].id,
	);
	const entityBFull = fullCustomer.entities.find(
		(entity) => entity.id === entities[1].id,
	);
	if (!entityAFull || !entityBFull) {
		throw new Error(
			"Expected both entities to exist after the downgrade setup",
		);
	}

	const premiumProducts = fullCustomer.customer_products.filter(
		(customerProduct) => customerProduct.product.id === premium.id,
	);
	const proProducts = fullCustomer.customer_products.filter(
		(customerProduct) => customerProduct.product.id === pro.id,
	);

	expect(premiumProducts).toHaveLength(1);
	expect(premiumProducts[0].status).toBe(CusProductStatus.Active);
	expect(premiumProducts[0].canceled_at).not.toBeNull();
	expect(premiumProducts[0].internal_entity_id).toBe(entityAFull.internal_id);

	expect(proProducts).toHaveLength(2);
	expect(
		proProducts.find(
			(customerProduct) =>
				customerProduct.internal_entity_id === entityAFull.internal_id &&
				customerProduct.status === CusProductStatus.Scheduled,
		),
	).toBeDefined();
	expect(
		proProducts.find(
			(customerProduct) =>
				customerProduct.internal_entity_id === entityBFull.internal_id &&
				customerProduct.status === CusProductStatus.Active,
		),
	).toBeDefined();

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});
