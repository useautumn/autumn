/**
 * add_lines where Stripe, not Autumn, builds the invoice billed now.
 *
 * Contract:
 *   - A new subscription bills added lines once on its first invoice; renewals bill the plan alone.
 *   - Ending a trial bills added lines on the invoice Stripe creates for it.
 *   - Stripe Checkout charges added lines as one-time line items.
 *   - A one-off plan bills added lines on its invoice.
 *   - remove_lines stays limited to invoices Autumn builds.
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	BillingPreviewResponse,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectPreviewLinesCorrect,
	expectStripeInvoiceLinesCorrect,
} from "@tests/integration/billing/utils/expectInvoiceLineEditsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("add_lines stripe-billed 1: a new subscription bills the added line once")}`,
	async () => {
		const customerId = "add-lines-new-sub";
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { autumnV2_5, ctx, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
			add_lines: [{ amount: 30, description: "Usage catch-up" }],
		};

		const preview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(params);
		expect(preview.invoice_lines_addable).toBe(true);
		expect(preview.invoice_lines_removable).toBe(false);
		expectPreviewLinesCorrect({
			preview,
			total: 80,
			lines: [
				{ planId: premium.id, total: 50 },
				{ description: "Usage catch-up", total: 30 },
			],
		});

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>(params);
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId: result.invoice.stripe_id,
			total: 80,
			descriptions: ["Usage catch-up"],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 80,
		});

		if (!testClockId) throw new Error("Expected a Stripe test clock");
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
			currentEpochMs: advancedTo,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 50,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("add_lines stripe-billed 2: ending a trial bills the added line with it")}`,
	async () => {
		const customerId = "add-lines-trial-end";
		const proTrial = products.proWithTrial({
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 7,
		});
		const { autumnV2_5 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: proTrial.id,
			customize: { free_trial: null },
			add_lines: [{ amount: 15, description: "Trial catch-up" }],
		};

		const preview = (await autumnV2_5.billing.previewUpdate(
			params,
		)) as BillingPreviewResponse;
		expect(preview.invoice_lines_addable).toBe(true);
		expect(preview.total).toBeCloseTo(35, 2);

		await autumnV2_5.billing.update(params);
		// The $0 trial-start invoice, then the trial-end invoice with the added line.
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 35,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("add_lines stripe-billed 3: Stripe Checkout charges the added line once")}`,
	async () => {
		const customerId = "add-lines-checkout";
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { autumnV2_5, ctx } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [premium] })],
			actions: [],
		});

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			add_lines: [{ amount: 30, description: "Usage catch-up" }],
		});
		const sessionId = result.payment_url?.match(
			/cs_(test|live)_[A-Za-z0-9]+/,
		)?.[0];
		if (!sessionId) throw new Error("Expected a Stripe Checkout session");

		const lineItems = await ctx.stripeCli.checkout.sessions.listLineItems(
			sessionId,
			{ limit: 100 },
		);
		const added = lineItems.data.find(
			(line) => line.description === "Usage catch-up",
		);
		expect(added?.amount_total).toBe(3000);
		expect(added?.price?.recurring).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("add_lines stripe-billed 4: a one-off plan bills the added line on its invoice")}`,
	async () => {
		const customerId = "add-lines-one-off";
		const oneOff = products.oneOff({
			items: [items.oneOffMessages({ price: 10, billingUnits: 100 })],
		});
		const { autumnV2_5, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOff] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: oneOff.id,
			redirect_mode: "if_required",
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 400 }],
		};
		const basePreview: BillingPreviewResponse =
			await autumnV2_5.billing.previewAttach<AttachParamsV1Input>(params);
		const expectedTotal = basePreview.total + 10;

		const result = await autumnV2_5.billing.attach<AttachParamsV1Input>({
			...params,
			add_lines: [{ amount: 10, description: "Rush delivery" }],
		});
		await expectStripeInvoiceLinesCorrect({
			stripeCli: ctx.stripeCli,
			stripeInvoiceId: result.invoice.stripe_id,
			total: expectedTotal,
			descriptions: ["Rush delivery"],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("add_lines stripe-billed 5: a free plan, or remove_lines on a new subscription, is a 400")}`,
	async () => {
		const customerId = "add-lines-blocked";
		const free = products.base({
			items: [items.monthlyMessages({ includedUsage: 10 })],
			id: "free",
		});
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_5 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errMessage:
				"add_lines needs a charge billed now; this request bills nothing now",
			func: () =>
				autumnV2_5.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: free.id,
					redirect_mode: "if_required",
					add_lines: [{ amount: 10, description: "Setup" }],
				}),
		});

		await expectAutumnError({
			errMessage:
				"remove_lines needs a change billed immediately on an existing subscription; this request creates a new subscription",
			func: () =>
				autumnV2_5.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					redirect_mode: "if_required",
					remove_lines: [{ plan_id: pro.id }],
				}),
		});
	},
);
