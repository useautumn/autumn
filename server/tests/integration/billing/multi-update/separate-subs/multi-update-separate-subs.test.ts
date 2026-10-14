import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	MultiUpdateParamsV0Input,
} from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("multi update separate subs: cancel both EOC, both subs canceling")}`,
	async () => {
		const customerId = "multi-update-sep-subs-eoc";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		const proSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const addonSubId = await getSubscriptionId({
			ctx,
			customerId,
			productId: addon.id,
		});
		expect(proSubId).not.toBe(addonSubId);

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: addon.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			canceling: [pro.id, addon.id],
		});

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2, shouldBeCanceling: true },
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterAdvance =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterAdvance,
			notPresent: [pro.id, addon.id],
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update separate subs: cancel both immediately, one credit invoice per sub")}`,
	async () => {
		const customerId = "multi-update-sep-subs-imm";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: pro.id, cancel_action: "cancel_immediately" },
				{ plan_id: addon.id, cancel_action: "cancel_immediately" },
			],
		};

		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: -40,
			subscriptions: [
				{ planIds: [pro.id], total: -20, nextCycleTotal: null },
				{ planIds: [addon.id], total: -20, nextCycleTotal: null },
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>(
			multiUpdateParams,
		);

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id, addon.id],
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 4,
			invoiceIndex: 0,
			latestTotal: preview.total / 2,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 4,
			invoiceIndex: 1,
			latestTotal: preview.total / 2,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const creditInvoiceProductIds = (customerV3.invoices ?? [])
			.slice(0, 2)
			.map((invoice) => invoice.product_ids);
		expect(
			creditInvoiceProductIds.every((productIds) => productIds.length === 1),
		).toBe(true);
		expect(creditInvoiceProductIds.flat().sort()).toEqual(
			[pro.id, addon.id].sort(),
		);

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update separate subs: immediate on sub 1, EOC on sub 2")}`,
	async () => {
		const customerId = "multi-update-sep-subs-mixed";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{ plan_id: pro.id, cancel_action: "cancel_immediately" },
				{ plan_id: addon.id, cancel_action: "cancel_end_of_cycle" },
			],
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id],
			canceling: [addon.id],
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: -20,
			latestInvoiceProductId: pro.id,
		});

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1, shouldBeCanceling: true },
		});
	},
);
