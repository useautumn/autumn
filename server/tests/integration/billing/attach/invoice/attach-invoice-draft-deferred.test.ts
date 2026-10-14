import { expect, test } from "bun:test";
import { type ApiCustomerV3, type AttachParamsV0, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-def 1: new plan")}`,
	async () => {
		const customerId = "attach-inv-draft-def-new-plan";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(preview.total).toBe(20);

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: false,
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice!.status).toBe("draft");
		expect(result.invoice!.stripe_id).toBeDefined();
		expect(result.invoice!.total).toBe(preview.total);
		expect(result.invoice!.hosted_invoice_url).toBeNull();

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);
		expect(stripeInvoice.status).toBe("draft");

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

		await expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 1,
			latestTotal: preview.total,
			latestStatus: "draft",
		});

		const finalizedInvoice = await ctx.stripeCli.invoices.finalizeInvoice(
			result.invoice!.stripe_id,
		);
		expect(finalizedInvoice.status).toBe("open");
		expect(finalizedInvoice.hosted_invoice_url).toBeDefined();

		await completeInvoiceCheckout({
			url: finalizedInvoice.hosted_invoice_url!,
			ctx,
			customerId,
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 1,
			latestTotal: preview.total,
			latestStatus: "paid",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-def 2: upgrade")}`,
	async () => {
		const customerId = "attach-inv-draft-def-upgrade";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [proMessagesItem],
			trialDays: 7,
			cardRequired: false,
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial, premium] }),
			],
			actions: [
				s.billing.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 12 }),
			],
		});

		const customerDuringTrial =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerDuringTrial,
			active: [proTrial.id],
			notPresent: [premium.id],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const result = await autumnV1.billing.attach<AttachParamsV0>({
			customer_id: customerId,
			product_id: premium.id,
			invoice: true,
			finalize_invoice: true,
			enable_product_immediately: false,
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice!.status).toBe("open");
		expect(result.invoice!.stripe_id).toBeDefined();
		expect(result.invoice!.total).toBeLessThanOrEqual(preview.total + 0.01);
		expect(result.invoice!.total).toBeGreaterThanOrEqual(preview.total - 0.01);

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerBefore,
			active: [proTrial.id],
			notPresent: [premium.id],
		});

		await expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 2,
			latestTotal: preview.total,
			latestStatus: "open",
		});

		await completeInvoiceCheckout({
			url: result.invoice!.hosted_invoice_url!,
			ctx,
			customerId,
		});

		const paidInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);
		expect(paidInvoice.status).toBe("paid");

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [premium.id],
			notPresent: [proTrial.id],
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestTotal: preview.total,
			latestStatus: "paid",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-def 3: new plan no pm")}`,
	async () => {
		const customerId = "attach-inv-draft-def-new-plan-no-pm";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(preview.total).toBe(20);

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: false,
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice!.status).toBe("draft");
		expect(result.invoice!.stripe_id).toBeDefined();
		expect(result.invoice!.total).toBe(preview.total);
		expect(result.invoice!.hosted_invoice_url).toBeNull();
		expect(result.payment_url).toBeNull();

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);
		expect(stripeInvoice.status).toBe("draft");

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

		await expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 1,
			latestTotal: preview.total,
			latestStatus: "draft",
		});

		const finalizedInvoice = await ctx.stripeCli.invoices.finalizeInvoice(
			result.invoice!.stripe_id,
		);
		expect(finalizedInvoice.status).toBe("open");
		expect(finalizedInvoice.hosted_invoice_url).toBeDefined();

		await completeInvoiceCheckout({
			url: finalizedInvoice.hosted_invoice_url!,
			ctx,
			customerId,
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 1,
			latestTotal: preview.total,
			latestStatus: "paid",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-def 4: one-off")}`,
	async () => {
		const customerId = "attach-inv-draft-def-oneoff";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOff = products.oneOff({
			id: "one-off-credits",
			items: [oneOffMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOff] }),
			],
			actions: [],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});
		expect(preview.total).toBe(20);

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: false,
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice!.status).toBe("draft");
		expect(result.invoice!.stripe_id).toBeDefined();
		expect(result.invoice!.total).toBe(preview.total);

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

		const finalizedInvoice = await ctx.stripeCli.invoices.finalizeInvoice(
			result.invoice!.stripe_id,
		);
		expect(finalizedInvoice.status).toBe("open");

		await completeInvoiceCheckout({
			url: finalizedInvoice.hosted_invoice_url!,
			ctx,
			customerId,
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [oneOff.id],
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 1,
			latestTotal: preview.total,
			latestStatus: "paid",
		});
	},
);
