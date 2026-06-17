import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("new-plan entity allocated v2: pro and premium entities track independently")}`,
	async () => {
		const customerId = "new-plan-entity-allocated-v2";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 1 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
		});

		const { autumnV1, autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Dashboard }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 50,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Users,
			value: 3,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Users,
			value: 4,
		});
		await timeout(2000);

		const entityA = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entityA,
			active: [pro.id],
		});
		expectBalanceCorrect({
			customer: entityA,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 3,
			planId: pro.id,
			nextResetAt: null,
		});

		const entityB = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		await expectCustomerProducts({
			customer: entityB,
			active: [premium.id],
		});
		expectBalanceCorrect({
			customer: entityB,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 4,
			planId: premium.id,
			nextResetAt: null,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 50,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
