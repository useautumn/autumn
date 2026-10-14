import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("new-plan: entity monthly + add-on, add customer annual (different scopes)")}`,
	async () => {
		const customerId = "new-plan-ent-addon-cust-annual";

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const proMonthly = products.pro({
			id: "pro-monthly",
			items: [proMessages],
		});

		const storageItem = items.monthlyMessages({ includedUsage: 1000 });
		const storageAddOn = products.base({
			id: "storage-addon",
			isAddOn: true,
			items: [storageItem, items.monthlyPrice({ price: 10 })],
		});

		const enterpriseMessages = items.monthlyMessages({ includedUsage: 10000 });
		const enterpriseAnnual = products.base({
			id: "enterprise-annual",
			items: [enterpriseMessages, items.annualPrice({ price: 500 })],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proMonthly, storageAddOn, enterpriseAnnual] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: proMonthly.id, entityIndex: 0 }),
				s.billing.attach({ productId: storageAddOn.id, entityIndex: 0 }),
			],
		});

		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entityBefore,
			active: [proMonthly.id, storageAddOn.id],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: enterpriseAnnual.id,
		});

		expect(preview.total).toBe(500);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: enterpriseAnnual.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);

		await expectProductActive({
			customer,
			productId: enterpriseAnnual.id,
		});

		await expectCustomerProducts({
			customer: entity,
			active: [proMonthly.id, storageAddOn.id],
		});

		if (!isBalanceWorkerRoute()) {
			expectCustomerFeatureCorrect({
				customer,
				featureId: TestFeature.Messages,
				includedUsage: 11500,
				balance: 11500,
				usage: 0,
			});
		}

		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: 500,
		});
	},
);
