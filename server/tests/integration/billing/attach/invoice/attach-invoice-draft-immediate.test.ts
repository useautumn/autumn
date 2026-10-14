import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-imm 1: new plan")}`,
	async () => {
		const customerId = "attach-inv-draft-imm-new-plan";

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
			enable_product_immediately: true,
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
		expect(stripeInvoice.total).toBe(
			atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
		);

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			notPresent: [pro.id],
		});
		expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

		const finalized = await ctx.stripeCli.invoices.finalizeInvoice(
			result.invoice!.stripe_id,
		);
		expect(finalized.status).toBe("open");

		await expectProductActive({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			productId: pro.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
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
			latestStatus: "open",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-imm 2: upgrade")}`,
	async () => {
		const customerId = "attach-inv-draft-imm-upgrade";

		const messagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const { autumnV1, ctx: testCtx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBe(30);

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: true,
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
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id],
			notPresent: [premium.id],
		});

		await ctx.stripeCli.invoices.finalizeInvoice(result.invoice!.stripe_id);

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [premium.id],
			notPresent: [pro.id],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
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
			latestStatus: "open",
		});

		await expectSubToBeCorrect({
			db: testCtx.db,
			customerId,
			org: testCtx.org,
			env: testCtx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-imm 3: downgrade")}`,
	async () => {
		const customerId = "attach-inv-draft-imm-downgrade";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const {
			autumnV1,
			ctx: testCtx,
			advancedTo,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: "premium" })],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			total: 20,
			startsAt: addMonths(advancedTo, 1).getTime(),
		});

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: true,
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeFalsy();
		expect(result.payment_url).toBeFalsy();

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductCanceling({
			customer,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer,
			productId: pro.id,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});

		await expectSubToBeCorrect({
			db: testCtx.db,
			customerId,
			org: testCtx.org,
			env: testCtx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-imm 4: one-off")}`,
	async () => {
		const customerId = "attach-inv-draft-imm-oneoff";

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
			enable_product_immediately: true,
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice!.status).toBe("draft");
		expect(result.invoice!.stripe_id).toBeDefined();
		expect(result.invoice!.total).toBe(preview.total);

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);
		expect(stripeInvoice.status).toBe("draft");

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

		await ctx.stripeCli.invoices.finalizeInvoice(result.invoice!.stripe_id);

		await expectProductActive({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			productId: oneOff.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
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
			latestStatus: "open",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-draft-imm 5: one-off on existing sub")}`,
	async () => {
		const customerId = "attach-inv-draft-imm-oneoff-existing";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 50,
			price: 5,
		});
		const oneOffAddon = products.oneOff({
			id: "one-off-addon",
			items: [oneOffMessagesItem],
			isAddOn: true,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, oneOffAddon] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
		});
		expect(preview.total).toBe(15);

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 50 }],
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: true,
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expect(result.invoice!.status).toBe("draft");
		expect(result.invoice!.stripe_id).toBeDefined();
		expect(result.invoice!.total).toBe(preview.total);

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
		);
		expect(stripeInvoice.status).toBe("draft");

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id],
			notPresent: [oneOffAddon.id],
		});
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});

		await ctx.stripeCli.invoices.finalizeInvoice(result.invoice!.stripe_id);

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id, oneOffAddon.id],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 150,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestTotal: preview.total,
			latestStatus: "open",
		});
	},
);
