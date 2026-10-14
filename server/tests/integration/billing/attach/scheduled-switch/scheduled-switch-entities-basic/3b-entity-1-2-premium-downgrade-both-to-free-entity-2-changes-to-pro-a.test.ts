import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-basic 3b: entity 1 & 2 premium, downgrade both to free, entity 2 changes to pro (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-ent-replace-b";

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

		const {
			autumnV1: autumnV1After,
			entities: entitiesAfter,
			ctx: ctxAfter,
		} = await initScenario({
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
				s.billing.attach({ productId: free.id, entityIndex: 1 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.advanceToNextInvoice(),
			],
		});

		const entity1After = await autumnV1After.entities.get<ApiEntityV0>(
			customerId,
			entitiesAfter[0].id,
		);
		const entity2After = await autumnV1After.entities.get<ApiEntityV0>(
			customerId,
			entitiesAfter[1].id,
		);

		await expectCustomerProducts({
			customer: entity1After,
			active: [free.id],
			notPresent: [premium.id, pro.id],
		});
		await expectCustomerProducts({
			customer: entity2After,
			active: [pro.id],
			notPresent: [premium.id, free.id],
		});

		expectCustomerFeatureCorrect({
			customer: entity1After,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: entity2After,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});

		await expectSubToBeCorrect({
			db: ctxAfter.db,
			customerId,
			org: ctxAfter.org,
			env: ctxAfter.env,
		});
	},
);
