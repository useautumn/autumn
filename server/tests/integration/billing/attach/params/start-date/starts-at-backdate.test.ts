/**
 * TDD test for backdated starts_at on new Stripe subscriptions.
 *
 * Contract under test:
 *   New types/fields:
 *     - Internal BillingContext.subscriptionBackdateStartMs?: epoch milliseconds
 *   New endpoints:
 *     - Existing billing.attach accepts starts_at in the past for supported new-subscription creation
 *   New behaviors:
 *     - Paid recurring attach with payment method and no existing Stripe subscription creates one Stripe subscription with start_date backdated to starts_at
 *     - The first invoice is created by Stripe for the backdated subscription
 *     - Past starts_at is rejected when the customer already has a Stripe subscription
 *     - Past starts_at is rejected when Stripe Checkout would be required
 *   Side effects:
 *     - Autumn customer_product is active, stores the past starts_at, and links to the created Stripe subscription
 *
 * Pre-impl red: attach rejects all past starts_at values before Stripe subscription creation can run.
 * Post-impl green: supported new subscriptions use Stripe backdate_start_date and unsupported paths fail fast.
 */

import { expect, test } from "bun:test";
import { type AttachParamsV1Input, ErrCode, ms } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectAttachBackdateCorrect } from "./utils/expectAttachBackdateCorrect";

test.concurrent(
	`${chalk.yellowBright("starts_at backdate: new paid recurring subscription is backdated")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-new-sub";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const startsAt = advancedTo - ms.days(35);
		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startsAt,
		});

		expect(result.invoice?.stripe_id).toBeDefined();
		await expectAttachBackdateCorrect({
			autumn: autumnV1,
			ctx,
			customerId,
			productId: pro.id,
			startsAt,
			result,
			minInvoiceTotal: 2000,
			minInvoiceLineCount: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at backdate: existing subscriptions are rejected")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-existing-sub";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Past starts_at is only supported when creating a new Stripe subscription",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: premium.id,
					starts_at: advancedTo - ms.days(10),
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at backdate: Stripe Checkout-required attaches are rejected")}`,
	async () => {
		const customerId = "attach-starts-at-backdate-checkout";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Past starts_at cannot be used when Stripe Checkout is required",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: pro.id,
					starts_at: advancedTo - ms.days(10),
				}),
		});
	},
);
