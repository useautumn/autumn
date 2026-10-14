import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductPastDue,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("sub.updated: product enters past_due after failed renewal payment")}`,
	async () => {
		const customerId = "sub-updated-past-due-basic";

		const messagesItem = items.monthlyMessages({ includedUsage: 10 });
		const dashboardItem = items.dashboard();
		const adminItem = items.adminRights();

		const pro = products.pro({
			id: "pro",
			items: [dashboardItem, messagesItem, adminItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.removePaymentMethod(),
				s.attachPaymentMethod({ type: "fail" }),
				s.advanceTestClock({ toNextInvoice: true }),
			],
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			pastDue: [pro.id],
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 2,
			invoiceIndex: 0,
			latestTotal: 20,
			latestStatus: "open",
			latestInvoiceProductId: pro.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("sub.updated 3: upgrade from premium to ultra while past_due, product stays past_due")}`,
	async () => {
		const customerId = "sub-updated-past-due-upgrade";

		const messagesItem = items.monthlyMessages({ includedUsage: 10 });

		const premium = products.premium({
			id: "premium",
			items: [messagesItem],
		});

		const ultra = products.ultra({
			id: "ultra",
			items: [messagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, ultra] }),
			],
			actions: [
				s.attach({ productId: premium.id }),
				s.removePaymentMethod(),
				s.attachPaymentMethod({ type: "fail" }),
				s.advanceToNextInvoice(),
			],
		});

		const customerBeforeUpgrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductPastDue({
			customer: customerBeforeUpgrade,
			productId: premium.id,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: ultra.id,
		});

		const customerAfterUpgrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterUpgrade,
			pastDue: [premium.id],
			notPresent: [ultra.id],
		});
	},
);
