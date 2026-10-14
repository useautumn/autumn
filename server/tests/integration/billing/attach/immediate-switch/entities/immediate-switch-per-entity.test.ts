import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-per-entity 1: upgrade with consumable RESETS, allocated CARRIES OVER")}`,
	async () => {
		const customerId = "imm-switch-pe-mixed-upgrade";

		const proPerEntityMessages = items.consumableMessages({
			includedUsage: 500,
			entityFeatureId: TestFeature.Users,
		});
		const proPerEntityWorkflows = items.freeAllocatedWorkflows({
			includedUsage: 10,
			entityFeatureId: TestFeature.Users,
		});
		const pro = products.pro({
			id: "pro",
			items: [proPerEntityMessages, proPerEntityWorkflows],
		});

		const premiumPerEntityMessages = items.consumableMessages({
			includedUsage: 1000,
			entityFeatureId: TestFeature.Users,
		});
		const premiumPerEntityWorkflows = items.freeAllocatedWorkflows({
			includedUsage: 20,
			entityFeatureId: TestFeature.Users,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumPerEntityMessages, premiumPerEntityWorkflows],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, timeout: 4000 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 200,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 300,
					entityIndex: 1,
				}),
				s.track({
					featureId: TestFeature.Workflows,
					value: 5,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Workflows,
					value: 8,
					entityIndex: 1,
					timeout: 2000,
				}),
			],
		});

		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity1Before,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 300,
			usage: 200,
		});
		expectCustomerFeatureCorrect({
			customer: entity1Before,
			featureId: TestFeature.Workflows,
			includedUsage: 10,
			balance: 5,
			usage: 5,
		});

		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity2Before,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 200,
			usage: 300,
		});
		expectCustomerFeatureCorrect({
			customer: entity2Before,
			featureId: TestFeature.Workflows,
			includedUsage: 10,
			balance: 2,
			usage: 8,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBe(30);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		const entity1After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity1After,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: entity1After,
			featureId: TestFeature.Workflows,
			includedUsage: 20,
			balance: 15,
			usage: 5,
		});

		const entity2After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity2After,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: entity2After,
			featureId: TestFeature.Workflows,
			includedUsage: 20,
			balance: 12,
			usage: 8,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 2000,
			balance: 2000,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Workflows,
			includedUsage: 40,
			balance: 27,
			usage: 13,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 30,
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
	`${chalk.yellowBright("immediate-switch-per-entity 2: upgrade with overage mid-cycle - overage billed")}`,
	async () => {
		const customerId = "imm-switch-pe-overage-mid-cycle";

		const proPerEntityMessages = items.consumableMessages({
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const pro = products.pro({
			id: "pro",
			items: [proPerEntityMessages],
		});

		const premiumPerEntityMessages = items.consumableMessages({
			includedUsage: 500,
			entityFeatureId: TestFeature.Users,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumPerEntityMessages],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 150,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 200,
					entityIndex: 1,
					timeout: 2000,
				}),
			],
		});

		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity1Before,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: -50,
			usage: 150,
		});

		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity2Before,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: -100,
			usage: 200,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBe(45);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		const entity1After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity1After,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		const entity2After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		expectCustomerFeatureCorrect({
			customer: entity2After,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 45,
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
	`${chalk.yellowBright("immediate-switch-per-entity 3: entity-level product + per-entity product coexist")}`,
	async () => {
		const customerId = "imm-switch-pe-entity-level-coexist";

		const proMessages = items.consumableMessages({
			includedUsage: 500,
		});
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumPerEntityMessages = items.consumableMessages({
			includedUsage: 1000,
			entityFeatureId: TestFeature.Users,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumPerEntityMessages],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0, timeout: 4000 }),
				s.billing.attach({ productId: premium.id, timeout: 4000 }),
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: isBalanceWorkerRoute() ? [premium.id] : [pro.id, premium.id],
		});

		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);

		await expectProductActive({
			customer: entity1,
			productId: pro.id,
		});

		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			includedUsage: 1500,
			balance: 1500,
			usage: 0,
		});

		const entity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		expectCustomerFeatureCorrect({
			customer: entity2,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});

		if (!isBalanceWorkerRoute()) {
			expectCustomerFeatureCorrect({
				customer,
				featureId: TestFeature.Messages,
				includedUsage: 2500,
				balance: 2500,
				usage: 0,
			});
		}

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 50,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
