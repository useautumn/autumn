import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("new-plan: attach free to customer, then free to entity")}`,
	async () => {
		const customerId = "new-plan-attach-free-cust-ent";

		const messagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free-cust-ent",
			items: [messagesItem],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({}),
				s.products({ list: [free] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const previewCust = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: free.id,
		});
		expect(previewCust.total).toBe(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		const previewEnt = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
		});
		expect(previewEnt.total).toBe(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);

		await expectProductActive({
			customer,
			productId: free.id,
		});
		await expectProductActive({
			customer: entity,
			productId: free.id,
		});

		if (!isBalanceWorkerRoute()) {
			expectCustomerFeatureCorrect({
				customer,
				featureId: TestFeature.Messages,
				includedUsage: 100,
				balance: 100,
				usage: 0,
			});
		}
		expectCustomerFeatureCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 0,
		});
	},
);
