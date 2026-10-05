/**
 * No-card trials at attach time.
 *
 * Contract:
 *  - card_required: false, no invoice mode → trial runs in Autumn only: trialing, no Stripe sub, no invoice,
 *    marked on_trial_end "bill" so the product cron settles it
 *  - upgrading off an Autumn-only trial bills the new plan and drops the trial
 *  - downgrading off it also switches immediately: there is no paid period to wait out
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
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

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(fullCustomer.customer_products[0]?.on_trial_end).toBe("bill");
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-attach 2: upgrading off an Autumn-only trial bills the new plan")}`,
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

test.concurrent(
	`${chalk.yellowBright("no-card-trial-attach 3: downgrading off an Autumn-only trial switches immediately")}`,
	async () => {
		const proTrial = noCardProTrial();
		const basic = products.base({
			id: "basic",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 10 }),
			],
		});

		const { customerId, autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId: "no-card-attach-downgrade",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial, basic] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: basic.id,
			redirect_mode: "if_required",
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV1,
			active: [basic.id],
			notPresent: [proTrial.id],
		});
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 10,
		});
		await expectSubCount({ ctx, customerId, count: 1 });
	},
);
