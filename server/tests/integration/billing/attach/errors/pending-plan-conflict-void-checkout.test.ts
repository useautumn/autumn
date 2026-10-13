import { expect, test } from "bun:test";
import { type AttachParamsV1Input, CusProductStatus } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import {
	expectOnlyOneOpenInvoice,
	initFailedUpgrade,
} from "./utils/pendingPlanConflict";

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 5: voiding expires the pending upgrade before an explicit retry creates a new invoice")}`,
	async () => {
		const customerId = "pending-plan-conflict-void";
		const { autumnV2_4, ctx, customer, pro, premium, first } =
			await initFailedUpgrade({ customerId });

		const pendingRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		expect(pendingRows).toHaveLength(1);
		const pending = pendingRows[0];
		expect(pending.product.id).toBe(premium.id);
		expect(pending.metadata_id).toBeTruthy();

		const voidedInvoice = await ctx.stripeCli.invoices.voidInvoice(
			first.invoice!.stripe_id!,
		);
		expect(voidedInvoice.status).toBe("void");

		await pollUntilAsserted({
			timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			fetch: () =>
				Promise.all([
					CusProductService.getFull({ db: ctx.db, id: pending.id }),
					MetadataService.get({ db: ctx.db, id: pending.metadata_id! }),
				]),
			assert: ([expired, metadata]) => {
				expect(expired?.status).toBe(CusProductStatus.Expired);
				expect(expired?.metadata_id).toBeNull();
				expect(metadata).toBeNull();
			},
		});
		await expectCustomerProducts({
			autumn: autumnV2_4,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
			notPresent: [premium.id],
		});

		const openInvoices = await ctx.stripeCli.invoices.list({
			customer: customer!.processor!.id!,
			status: "open",
			limit: 100,
		});
		expect(openInvoices.has_more).toBe(false);
		expect(openInvoices.data).toHaveLength(0);

		const retry = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(retry.required_action?.code).toBe("payment_failed");
		expect(retry.invoice?.status).toBe("open");
		expect(retry.invoice?.stripe_id).toBeTruthy();
		expect(retry.invoice?.stripe_id).not.toBe(first.invoice!.stripe_id);
		expect(retry.invoice?.total).toBe(first.invoice!.total);

		await expectOnlyOneOpenInvoice({
			ctx,
			stripeCustomerId: customer!.processor!.id!,
		});
		const retriedPendingRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		expect(retriedPendingRows).toHaveLength(1);
		expect(retriedPendingRows[0].product.id).toBe(premium.id);
		expect(retriedPendingRows[0].id).not.toBe(pending.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 6: an open checkout session is arbitrated before the pending invoice is resumed")}`,
	async () => {
		const customerId = "pending-plan-conflict-checkout-lock";
		const credits = products.oneOffAddOn({
			id: "credits",
			items: [items.oneOffWords({ billingUnits: 100, price: 10 })],
		});
		const { autumnV2_4, ctx, customer, premium, first } =
			await initFailedUpgrade({ customerId, extraProducts: [credits] });

		const checkout = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: credits.id,
			feature_quantities: [{ feature_id: TestFeature.Words, quantity: 100 }],
			redirect_mode: "always",
		});
		expect(checkout.payment_url).toContain("checkout.stripe.com");

		const retry = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(retry.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
		expect(retry.payment_url).toBe(retry.invoice?.hosted_invoice_url);
		expect(retry.required_action).toBeUndefined();

		const sessions = await ctx.stripeCli.checkout.sessions.list({
			customer: customer?.processor?.id ?? "",
			limit: 100,
		});
		expect(sessions.has_more).toBe(false);
		expect(sessions.data.map((session) => session.status)).toEqual(["expired"]);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 7: long-lived retry by internal id still expires the public-id checkout reservation")}`,
	async () => {
		const customerId = "pending-plan-conflict-long-lived-alias";
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const credits = products.oneOffAddOn({
			id: "credits",
			items: [items.oneOffWords({ billingUnits: 100, price: 10 })],
		});

		const { autumnV2_4, ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [premium, credits] }),
			],
			actions: [
				s.billing.attach({
					productId: premium.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const checkout = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: credits.id,
			feature_quantities: [{ feature_id: TestFeature.Words, quantity: 100 }],
		});
		expect(checkout.payment_url).toContain("checkout.stripe.com");

		const retry = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customer?.internal_id ?? "",
			plan_id: premium.id,
			long_lived_checkout: true,
		});
		expect(retry.invoice?.status).toBe("open");
		expect(retry.payment_url).toBe(retry.invoice?.hosted_invoice_url);

		const sessions = await ctx.stripeCli.checkout.sessions.list({
			customer: customer?.processor?.id ?? "",
			limit: 100,
		});
		expect(sessions.has_more).toBe(false);
		expect(sessions.data.map((session) => session.status)).toEqual(["expired"]);
	},
);
