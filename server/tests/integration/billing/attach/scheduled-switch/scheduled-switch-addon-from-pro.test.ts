import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-addon 1a: pro+addon to free (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-addon-pro-to-free-a";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
		const pro = products.pro({ id: "pro", items: [proMessagesItem] });

		const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({ id: "free", items: [freeMessagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [wordsItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, recurringAddon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: recurringAddon.id }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id, recurringAddon.id],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: free.id,
		});
		expect(preview.total).toBe(0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		const customerMidCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerMidCycle,
			canceling: [pro.id],
			active: [recurringAddon.id],
			scheduled: [free.id],
		});

		expectCustomerFeatureCorrect({
			customer: customerMidCycle,
			featureId: TestFeature.Messages,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer: customerMidCycle,
			featureId: TestFeature.Words,
			includedUsage: 200,
			balance: 200,
			usage: 0,
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
	`${chalk.yellowBright("scheduled-switch-addon 1b: pro+addon to free (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-addon-pro-to-free-b";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
		const pro = products.pro({ id: "pro", items: [proMessagesItem] });

		const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({ id: "free", items: [freeMessagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [wordsItem],
		});

		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, recurringAddon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: recurringAddon.id }),
				s.billing.attach({ productId: free.id }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customerAfterCycle =
			await autumnV1After.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCycle,
			active: [free.id, recurringAddon.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			includedUsage: 50,
			balance: 50,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Words,
			includedUsage: 200,
			balance: 200,
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

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-addon 3: addon persists through multiple switches")}`,
	async () => {
		const customerId = "sched-switch-addon-multi-switch";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
		const pro = products.pro({ id: "pro", items: [proMessagesItem] });

		const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({ id: "free", items: [freeMessagesItem] });

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [wordsItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, premium, recurringAddon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: recurringAddon.id }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id, recurringAddon.id],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		const customerAfterDowngrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterDowngrade,
			canceling: [pro.id],
			active: [recurringAddon.id],
			scheduled: [free.id],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customerAfterUpgrade =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterUpgrade,
			active: [premium.id, recurringAddon.id],
			notPresent: [pro.id, free.id],
		});

		expectCustomerFeatureCorrect({
			customer: customerAfterUpgrade,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfterUpgrade,
			featureId: TestFeature.Words,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
