import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectCustomerProductOptions } from "@tests/integration/utils/expectCustomerProductOptions.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const RECURRING_PACK_PRICE = 8;
const ONE_OFF_PACK_PRICE = 7;
const BASE_PRICE = 20;

test.concurrent(
	`${chalk.yellowBright("prepaid tie-break 1: attach with feature_quantities on mixed plan charges recurring prepaid only")}`,
	async () => {
		const plan = products.pro({
			id: "tie-break-attach",
			items: [
				items.prepaidMessages({ price: RECURRING_PACK_PRICE }),
				items.oneOffMessages({ price: ONE_OFF_PACK_PRICE }),
			],
		});

		const customerId = "prepaid-tie-break-attach";

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 200,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 2,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestTotal: BASE_PRICE + 2 * RECURRING_PACK_PRICE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid tie-break 2: update with feature_quantities on mixed plan is absolute on the recurring prepaid")}`,
	async () => {
		const plan = products.pro({
			id: "tie-break-update",
			items: [
				items.prepaidMessages({ price: RECURRING_PACK_PRICE }),
				items.oneOffMessages({ price: ONE_OFF_PACK_PRICE }),
			],
		});

		const customerId = "prepaid-tie-break-update";

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 300,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Messages,
			quantity: 3,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: 2 * RECURRING_PACK_PRICE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("prepaid tie-break 3: one-off-only feature on the same plan still manual-tops-up")}`,
	async () => {
		const plan = products.pro({
			id: "tie-break-isolation",
			items: [
				items.prepaidMessages({ price: RECURRING_PACK_PRICE }),
				items.oneOffWords({ price: ONE_OFF_PACK_PRICE }),
			],
		});

		const customerId = "prepaid-tie-break-isolation";

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			feature_quantities: [{ feature_id: TestFeature.Words, quantity: 100 }],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Words,
			remaining: 100,
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 100,
		});

		await expectCustomerProductOptions({
			ctx,
			customerId,
			productId: plan.id,
			featureId: TestFeature.Words,
			quantity: 1,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			latestTotal: ONE_OFF_PACK_PRICE,
		});
	},
);
