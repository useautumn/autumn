import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-cross 3: entity 1 premium to free, entity 2 premium to pro, advance cycle, upgrade entity 1 to premium")}`,
	async () => {
		const customerId = "sched-switch-ent-post-cycle-upgrade";

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, entityIndex: 0 }),
				s.billing.attach({ productId: premium.id, entityIndex: 1 }),
				s.billing.attach({ productId: free.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.advanceToNextInvoice(),
			],
		});

		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		await expectProductActive({
			customer: entity1Before,
			productId: free.id,
		});
		await expectProductActive({
			customer: entity2Before,
			productId: pro.id,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		const entity1After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entity1After,
			productId: premium.id,
		});
		await expectProductNotPresent({
			customer: entity1After,
			productId: free.id,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-cross 4: entity 1 premiumAnnual to pro, entity 2 premium to pro, advance cycle, upgrade entity 2 to premium")}`,
	async () => {
		const customerId = "sched-switch-ent-annual-monthly";

		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const premiumAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
		const premiumAnnualPrice = items.annualPrice({ price: 500 });
		const premiumAnnual = products.base({
			id: "premium-annual",
			items: [premiumAnnualMessages, premiumAnnualPrice],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, premiumAnnual] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premiumAnnual.id, entityIndex: 0 }),
				s.billing.attach({ productId: premium.id, entityIndex: 1 }),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					planSchedule: "immediate",
				}),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.advanceToNextInvoice(),
			],
		});

		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entity1Before,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entity1Before,
			productId: premiumAnnual.id,
		});

		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2Before,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entity2Before,
			productId: premium.id,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[1].id,
			redirect_mode: "if_required",
		});

		const entity2After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2After,
			productId: premium.id,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
