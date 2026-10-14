import { test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { handleVoidInvoiceCron } from "@/cron/invoiceCron/runInvoiceCron";
import {
	expectCustomerProductStatus,
	expectUnpaidDeferredInvoiceCleanedUp,
	getPendingDeferredInvoice,
} from "./utils/deferredInvoiceUtils";

const deferredInvoiceAttach = (productId: string) =>
	s.billing.attach({
		productId,
		invoice: true,
		enableProductImmediately: false,
		finalizeInvoice: true,
	});

test.concurrent(
	`${chalk.yellowBright("deferred invoice unpaid 1: due date on a new plan expires it and cancels the sub")}`,
	async () => {
		const pro = products.pro({
			id: "pro-unpaid-due",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer } = await initScenario({
			customerId: "deferred-unpaid-due-new",
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [deferredInvoiceAttach(pro.id)],
		});

		const { metadata, stripeInvoice, stripeSubscriptionId } =
			await getPendingDeferredInvoice({
				ctx,
				customer: customer!,
				productId: pro.id,
			});

		await handleVoidInvoiceCron({ ctx, metadata });

		await expectUnpaidDeferredInvoiceCleanedUp({
			ctx,
			customer: customer!,
			productId: pro.id,
			metadataId: metadata.id,
			stripeInvoiceId: stripeInvoice.id,
			stripeSubscriptionId,
			stripeSubscriptionStatus: "canceled",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("deferred invoice unpaid 2: due date on an upgrade expires it but keeps the existing sub")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { ctx, customer } = await initScenario({
			customerId: "deferred-unpaid-due-upgrade",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				deferredInvoiceAttach(premium.id),
			],
		});

		const { metadata, stripeInvoice, stripeSubscriptionId } =
			await getPendingDeferredInvoice({
				ctx,
				customer: customer!,
				productId: premium.id,
			});

		await handleVoidInvoiceCron({ ctx, metadata });

		await expectUnpaidDeferredInvoiceCleanedUp({
			ctx,
			customer: customer!,
			productId: premium.id,
			metadataId: metadata.id,
			stripeInvoiceId: stripeInvoice.id,
			stripeSubscriptionId,
			stripeSubscriptionStatus: "active",
		});
		await expectCustomerProductStatus({
			ctx,
			customer: customer!,
			productId: pro.id,
			status: CusProductStatus.Active,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("deferred invoice unpaid 3: voiding in Stripe expires the plan and cancels the sub")}`,
	async () => {
		const pro = products.pro({
			id: "pro-unpaid-void",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, customer } = await initScenario({
			customerId: "deferred-unpaid-stripe-void",
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [deferredInvoiceAttach(pro.id)],
		});

		const { metadata, stripeInvoice, stripeSubscriptionId } =
			await getPendingDeferredInvoice({
				ctx,
				customer: customer!,
				productId: pro.id,
			});

		await ctx.stripeCli.invoices.voidInvoice(stripeInvoice.id);
		await timeout(12_000);

		await expectUnpaidDeferredInvoiceCleanedUp({
			ctx,
			customer: customer!,
			productId: pro.id,
			metadataId: metadata.id,
			stripeInvoiceId: stripeInvoice.id,
			stripeSubscriptionId,
			stripeSubscriptionStatus: "canceled",
		});
	},
);
