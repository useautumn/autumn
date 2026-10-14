import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: addon canceling, pro active, free default not scheduled")}`,
	async () => {
		const customerId = "cancel-addon-eoc-basic";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id }),
			],
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterAttach,
			active: [pro.id, addon.id],
			notPresent: [free.id],
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 2,
			latestTotal: 20,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: addon.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			active: [pro.id],
			canceling: [addon.id],
			notPresent: [free.id],
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
			notPresent: [addon.id, free.id],
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: cancel pro, addon persists with free scheduled")}`,
	async () => {
		const customerId = "cancel-addon-pro-free-scheduled";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id }),
			],
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		await expectProductActive({
			customer: customerAfterAttach,
			productId: addon.id,
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 2,
			latestTotal: 20,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			canceling: [pro.id],
			scheduled: [free.id],
			active: [addon.id],
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterAdvance,
			notPresent: [pro.id],
			active: [free.id, addon.id],
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);
