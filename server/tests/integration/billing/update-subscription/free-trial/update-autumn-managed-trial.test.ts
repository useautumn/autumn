/**
 * Update subscription on a no-card trial Autumn runs without Stripe (on_trial_end "bill", no sub).
 *
 * Contract:
 *  - extending it with another no-card trial keeps it Autumn-only and keeps the bill marker
 *  - removing the trial (free_trial: null) bills the plan now into a Stripe sub
 *  - invoice mode on it is rejected, matching attach
 *  - canceling it at end of cycle expires it at trial end without billing
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	FreeTrialDuration,
	ms,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const TRIAL_DAYS = 7;
const EXTENDED_TRIAL_DAYS = 14;
const DAYS_PAST_TRIAL_END = TRIAL_DAYS + 1;

const noCardProTrial = () =>
	products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: TRIAL_DAYS,
		cardRequired: false,
	});

test.concurrent(
	`${chalk.yellowBright("update-autumn-trial 1: extending a no-card trial keeps it in Autumn")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, autumnV2_3, ctx, advancedTo } =
			await initScenario({
				customerId: "upd-autumn-trial-extend",
				setup: [s.customer({}), s.products({ list: [proTrial] })],
				actions: [s.billing.attach({ productId: proTrial.id })],
			});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: proTrial.id,
			customize: {
				free_trial: {
					duration_length: EXTENDED_TRIAL_DAYS,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
				},
			},
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductTrialing({
			customer,
			productId: proTrial.id,
			trialEndsAt: advancedTo + ms.days(EXTENDED_TRIAL_DAYS),
		});
		await expectSubCount({ ctx, customerId, count: 0 });

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(fullCustomer.customer_products[0]?.on_trial_end).toBe("bill");
	},
);

test.concurrent(
	`${chalk.yellowBright("update-autumn-trial 2: removing the trial bills the plan now")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId: "upd-autumn-trial-remove",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: proTrial.id,
			customize: { free_trial: null },
		});

		await expectProductActive({
			customerId,
			autumn: autumnV1,
			productId: proTrial.id,
		});
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotTrialing({ customer, productId: proTrial.id });
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 20,
		});
		await expectSubCount({ ctx, customerId, count: 1 });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-autumn-trial 3: invoice mode is rejected")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV2_3 } = await initScenario({
			customerId: "upd-autumn-trial-invoice",
			setup: [s.customer({}), s.products({ list: [proTrial] })],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		await expectAutumnError({
			errMessage: "Cannot use invoice mode with a no-card free trial",
			func: () =>
				autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
					customer_id: customerId,
					plan_id: proTrial.id,
					invoice_mode: {
						enabled: true,
						enable_plan_immediately: true,
						finalize: false,
					},
					customize: {
						free_trial: {
							duration_length: EXTENDED_TRIAL_DAYS,
							duration_type: FreeTrialDuration.Day,
							card_required: false,
						},
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-autumn-trial 4: canceled trial expires at trial end without billing")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, autumnV2_3, ctx, testClockId } =
			await initScenario({
				customerId: "upd-autumn-trial-cancel",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial] }),
				],
				actions: [s.billing.attach({ productId: proTrial.id })],
			});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: proTrial.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId ?? "",
			numberOfDays: DAYS_PAST_TRIAL_END,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV1,
			notPresent: [proTrial.id],
		});
		await expectSubCount({ ctx, customerId, count: 0 });
	},
);
