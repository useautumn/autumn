import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

const getLatestInvoice = ({ customer }: { customer: ApiCustomerV3 }) => {
	const invoice = customer.invoices?.[0];
	if (!invoice) {
		throw new Error("Expected customer to have an invoice");
	}
	return invoice;
};

const getAutumnInvoiceByStripeId = async ({
	db,
	stripeInvoiceId,
}: {
	db: Parameters<typeof InvoiceService.getByStripeId>[0]["db"];
	stripeInvoiceId: string;
}) => {
	const invoice = await InvoiceService.getByStripeId({
		db,
		stripeId: stripeInvoiceId,
	});
	if (!invoice) {
		throw new Error(`Expected Autumn invoice for ${stripeInvoiceId}`);
	}
	return invoice;
};

test.concurrent(
	`${chalk.yellowBright("already-canceling cancel immediately: invoice credits (prorated)")}`,
	async () => {
		const customerId = "cancel-already-canceling-credits";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV0, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const customerWhileCanceling =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerWhileCanceling,
			productId: pro.id,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
			billing_behavior: "prorate_immediately" as const,
		};

		const preview = await autumnV0.subscriptions.previewUpdate(cancelParams);
		expect(preview.total).toBeLessThan(0);

		await autumnV0.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 2,
			latestTotal: preview.total,
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
	`${chalk.yellowBright("already-canceling cancel immediately: prorated refund to payment method")}`,
	async () => {
		const customerId = "cancel-already-canceling-refund";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV0, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
			],
		});

		const customerWhileCanceling =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerWhileCanceling,
			productId: pro.id,
		});
		expectCustomerInvoiceCorrect({
			customer: customerWhileCanceling,
			count: 1,
			latestTotal: 20,
		});

		const initialInvoice = getLatestInvoice({
			customer: customerWhileCanceling,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
			refund_last_payment: "prorated" as const,
		};

		const preview = await autumnV0.subscriptions.previewUpdate(cancelParams);
		expect(preview.total).toBe(0);
		expect(preview.refund).toEqual({
			amount: 20,
			invoice: {
				stripe_id: initialInvoice.stripe_id,
				total: 20,
				current_refunded_amount: 0,
				currency: initialInvoice.currency,
			},
		});

		await autumnV0.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
			db: ctx.db,
			stripeInvoiceId: initialInvoice.stripe_id,
		});
		expect(autumnInvoiceAfterCancel.refunded_amount).toBe(20);

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("already-canceling cancel immediately: no refund")}`,
	async () => {
		const customerId = "cancel-already-canceling-none";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV0, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const customerWhileCanceling =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerWhileCanceling,
			productId: pro.id,
		});

		const initialInvoice = getLatestInvoice({
			customer: customerWhileCanceling,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
			billing_behavior: "none" as const,
		};

		const preview = await autumnV0.subscriptions.previewUpdate(cancelParams);
		expect(preview.total).toBe(0);
		expect(preview.refund).toBeUndefined();

		await autumnV0.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 1,
		});
		const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
			db: ctx.db,
			stripeInvoiceId: initialInvoice.stripe_id,
		});
		expect(autumnInvoiceAfterCancel.refunded_amount ?? 0).toBe(0);

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
