/**
 * No-card trials at attach time.
 *
 * Contract:
 *  - card_required: false, no invoice mode → trial runs in Autumn only: trialing, no Stripe sub, no invoice
 *  - card_required: false + invoice mode → Stripe trialing sub with send_invoice, so Stripe invoices at trial end
 *  - upgrading off an Autumn-only trial bills the new plan and drops the trial
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	FreeTrialDuration,
	ms,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const TRIAL_DAYS = 7;

const noCardProTrial = () =>
	products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: TRIAL_DAYS,
		cardRequired: false,
	});

test.concurrent(
	`${chalk.yellowBright("no-card-trial-attach 1: trial runs in Autumn without a Stripe subscription")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, autumnV2_3, ctx, advancedTo } =
			await initScenario({
				customerId: "no-card-attach-autumn-only",
				setup: [s.customer({}), s.products({ list: [proTrial] })],
				actions: [],
			});

		const result = await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: proTrial.id,
			redirect_mode: "if_required",
		});
		expect(result.payment_url).toBeFalsy();

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductTrialing({
			customer,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(TRIAL_DAYS),
		});
		await expectCustomerInvoiceCorrect({ customer, count: 0 });
		await expectSubCount({ ctx, customerId, count: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-attach 2: invoice mode keeps a send_invoice Stripe trial")}`,
	async () => {
		const enterprise = products.base({
			id: "enterprise",
			items: [items.monthlyPrice({ price: 50 })],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "no-card-attach-invoice",
			setup: [s.customer({}), s.products({ list: [enterprise] })],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: true,
				finalize: false,
			},
			customize: {
				free_trial: {
					duration_length: 15,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
				},
			},
		});

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer?.processor?.id ?? "",
		});

		expect(subscriptions.data).toHaveLength(1);
		const [subscription] = subscriptions.data;
		expect(subscription.status).toBe("trialing");
		expect(subscription.collection_method).toBe("send_invoice");
		expect(
			subscription.trial_settings?.end_behavior.missing_payment_method,
		).not.toBe("cancel");
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-attach 3: upgrading off an Autumn-only trial bills the new plan")}`,
	async () => {
		const proTrial = noCardProTrial();
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 2000 })],
		});

		const { customerId, autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId: "no-card-attach-upgrade",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial, premium] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		await expectSubCount({ ctx, customerId, count: 0 });

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV1,
			active: [premium.id],
			notPresent: [proTrial.id],
		});
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 50,
		});
		await expectSubCount({ ctx, customerId, count: 1 });
	},
);
