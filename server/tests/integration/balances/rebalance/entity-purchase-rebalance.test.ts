import { expect, test } from "bun:test";
import type {
	ApiEntityV2,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const planBalanceOf = ({
	entity,
	planId,
}: {
	entity: ApiEntityV2;
	planId: string;
}) => {
	const breakdown = entity.balances[TestFeature.Messages]?.breakdown?.find(
		(item) => item.plan_id === planId,
	);
	expect(breakdown).toBeDefined();
	return breakdown!;
};

test.concurrent(
	`${chalk.yellowBright("entity purchase 1: a manual top-up on an entity's plan credits the entity")}`,
	async () => {
		const plan = products.pro({
			id: "entity-topup",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "entity-purchase-topup",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});
		const entityId = entities[0].id;

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			entity_id: entityId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});

		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entityId,
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			remaining: 200,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("entity purchase 2: a one-off add-on on an entity pays down the entity's overage, then credits the rest")}`,
	async () => {
		const recurringPlan = products.base({
			id: "entity-recurring",
			items: [items.lifetimeMessages({ includedUsage: 1000 })],
			billingControls: {
				overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
			},
		});
		const oneOffAddOn = products.oneOffAddOn({
			id: "entity-credit-add-on",
			items: [items.oneOffMessages({ billingUnits: 100, price: 10 })],
		});

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "entity-purchase-one-off",
			setup: [
				s.platform.create({
					userEmail: `entity-purchase-one-off-${Math.random().toString(36).slice(2)}@autumn.test`,
					configOverrides: { persist_free_overage: true },
					setupDefaultFeatures: true,
				}),
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringPlan, oneOffAddOn] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: recurringPlan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 1500,
					entityIndex: 0,
					timeout: 2000,
				}),
			],
		});
		const entityId = entities[0].id;

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entityId,
			plan_id: oneOffAddOn.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 600 }],
			redirect_mode: "if_required",
		});

		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entityId,
		);
		expect(planBalanceOf({ entity, planId: recurringPlan.id })).toMatchObject({
			remaining: 0,
			usage: 1000,
		});
		expect(planBalanceOf({ entity, planId: oneOffAddOn.id }).remaining).toBe(
			100,
		);
	},
);
