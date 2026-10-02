/**
 * No-card trials at trial end (settled by the product cron, driven here by the test clock).
 *
 * Contract:
 *  - no card on file → trial expires and the free default plan takes over, still no Stripe sub
 *  - card added during the trial → plan is billed into a new Stripe sub and stops trialing
 *  - two entities trialing the same plan convert into a single Stripe sub
 *  - on_end: revert with no previous plan → expires to the default plan, never billed even with a card
 *  - a trial Autumn did not mark on_trial_end "bill" (e.g. no_billing_changes, legacy rows) is never settled
 */

import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV0,
	type AttachParamsV1Input,
	FreeTrialDuration,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const TRIAL_DAYS = 7;
const DAYS_PAST_TRIAL_END = TRIAL_DAYS + 1;

const noCardProTrial = () =>
	products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: TRIAL_DAYS,
		cardRequired: false,
	});

const freeDefault = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
		isDefault: true,
	});

test.concurrent(
	`${chalk.yellowBright("no-card-trial-end 1: no card on file → expires to the free default")}`,
	async () => {
		const proTrial = noCardProTrial();
		const free = freeDefault();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "no-card-end-expire",
			setup: [s.customer({}), s.products({ list: [proTrial, free] })],
			actions: [
				s.billing.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
			],
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV1,
			active: [free.id],
			notPresent: [proTrial.id],
		});
		await expectSubCount({ ctx, customerId, count: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-end 2: card added during trial → billed into a Stripe sub")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "no-card-end-convert",
			setup: [s.customer({}), s.products({ list: [proTrial] })],
			actions: [
				s.billing.attach({ productId: proTrial.id }),
				s.attachPaymentMethod({ type: "success" }),
				s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
			],
		});

		await expectProductActive({
			customerId,
			autumn: autumnV1,
			productId: proTrial.id,
		});
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotTrialing({ customer, productId: proTrial.id });
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: 20,
		});
		await expectSubCount({ ctx, customerId, count: 1 });
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-end 3: entities on the same trial convert into one sub")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, ctx, entities } = await initScenario({
			customerId: "no-card-end-entities",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
				s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
				s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
			],
		});

		for (const entity of entities) {
			const customerEntity = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			await expectProductActive({
				customer: customerEntity,
				productId: proTrial.id,
			});
			await expectProductNotTrialing({
				customer: customerEntity,
				productId: proTrial.id,
			});
		}
		await expectSubCount({ ctx, customerId, count: 1 });
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-end 5: trial without the bill marker is left alone")}`,
	async () => {
		const proTrial = noCardProTrial();

		const { customerId, autumnV1, autumnV2_3, ctx, testClockId } =
			await initScenario({
				customerId: "no-card-end-unmarked",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proTrial] }),
				],
				actions: [],
			});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: proTrial.id,
			no_billing_changes: true,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId ?? "",
			numberOfDays: DAYS_PAST_TRIAL_END,
		});

		await expectProductActive({
			customerId,
			autumn: autumnV1,
			productId: proTrial.id,
		});
		await expectSubCount({ ctx, customerId, count: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("no-card-trial-end 4: revert with no previous plan → expires to the free default")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const free = freeDefault();

		const { customerId, autumnV1, autumnV2_3, ctx, testClockId } =
			await initScenario({
				customerId: "no-card-end-revert",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, free] }),
				],
				actions: [],
			});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: TRIAL_DAYS,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		});
		await expectSubCount({ ctx, customerId, count: 0 });

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId ?? "",
			numberOfDays: DAYS_PAST_TRIAL_END,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV1,
			active: [free.id],
			notPresent: [pro.id],
		});
		await expectSubCount({ ctx, customerId, count: 0 });
	},
);
