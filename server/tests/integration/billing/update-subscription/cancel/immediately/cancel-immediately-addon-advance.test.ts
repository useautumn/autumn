import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: with scheduled downgrade")}`,
	async () => {
		const customerId = "cancel-addon-imm-4";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const premium = products.base({
			id: "premium",
			items: [messagesItem, items.monthlyPrice({ price: 30 })],
		});

		const pro = products.pro({ items: [messagesItem] });

		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [messagesItem],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro, recurringAddon] }),
			],
			actions: [
				s.attach({ productId: premium.id }),
				s.attach({ productId: recurringAddon.id }),
				s.attach({ productId: pro.id }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [recurringAddon.id],
			canceling: [premium.id],
			scheduled: [pro.id],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: recurringAddon.id,
			cancel_action: "cancel_immediately",
		});

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			canceling: [premium.id],
			scheduled: [pro.id],
			notPresent: [recurringAddon.id],
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterAdvance,
			active: [pro.id],
			notPresent: [premium.id, recurringAddon.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: cancel both pro and addon")}`,
	async () => {
		const customerId = "cancel-addon-imm-6";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});

		const pro = products.pro({ items: [messagesItem] });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [messagesItem],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, recurringAddon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: recurringAddon.id }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id, recurringAddon.id],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: recurringAddon.id,
			cancel_action: "cancel_immediately",
		});

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: pro.id,
		});
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [recurringAddon.id],
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterAdvance,
			active: [free.id],
			notPresent: [pro.id, recurringAddon.id],
		});
	},
);
