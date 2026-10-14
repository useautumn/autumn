import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	CusProductStatus,
	type MultiUpdateParamsV0Input,
} from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(
	`${chalk.yellowBright("multi update entities: cancel same plan on two entities immediately")}`,
	async () => {
		const customerId = "multi-update-entities-imm";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: pro.id,
					entity_id: entities[0].id,
					cancel_action: "cancel_immediately",
				},
				{
					plan_id: pro.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_immediately",
				},
			],
		});

		for (const entity of [entities[0], entities[1]]) {
			const entityCustomer = await autumnV2_3.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			await expectProductNotPresent({
				customer: entityCustomer,
				productId: pro.id,
			});
		}

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update entities: entity 1 immediately, entity 2 EOC")}`,
	async () => {
		const customerId = "multi-update-entities-mixed";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: pro.id,
					entity_id: entities[0].id,
					cancel_action: "cancel_immediately",
				},
				{
					plan_id: pro.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_end_of_cycle",
				},
			],
		});

		const entity1Customer = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectProductNotPresent({
			customer: entity1Customer,
			productId: pro.id,
		});

		const entity2Customer = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		await expectProductCanceling({
			customer: entity2Customer,
			productId: pro.id,
		});

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1, shouldBeCanceling: true },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update entities: top-level entity_id default with per-update override")}`,
	async () => {
		const customerId = "multi-update-entities-scope";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			updates: [
				{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
				{
					plan_id: pro.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_end_of_cycle",
				},
			],
		});

		for (const entity of [entities[0], entities[1]]) {
			const entityCustomer = await autumnV2_3.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			await expectProductCanceling({
				customer: entityCustomer,
				productId: pro.id,
			});
		}

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1, shouldBeCanceling: true },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update entities: customer_product_id without entity context")}`,
	async () => {
		const customerId = "multi-update-entities-by-id";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, proB] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
				s.attach({ productId: proB.id }),
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const entity1Internal = fullCustomer.entities.find(
			(entity) => entity.id === entities[0].id,
		);
		const entity1Pro = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product.id === pro.id &&
				customerProduct.internal_entity_id === entity1Internal?.internal_id &&
				customerProduct.status === CusProductStatus.Active,
		);
		expect(entity1Pro).toBeDefined();

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					customer_product_id: entity1Pro!.id,
					cancel_action: "cancel_immediately",
				},
				{ plan_id: proB.id, cancel_action: "cancel_immediately" },
			],
		});

		const entity1Customer = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectProductNotPresent({
			customer: entity1Customer,
			productId: pro.id,
		});

		const entity2Customer = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2Customer,
			productId: pro.id,
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proB.id],
		});

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1 },
		});
	},
);
