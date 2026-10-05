/**
 * A future phases[0].starts_at once the test clock passes the start:
 * - the Scheduled row turns Active, invoiced once at the start, including the prepaid quantity it
 *   was set with, and its balance resets a cycle after the start;
 * - a metered price bills nothing at the start; its usage is billed at the end of the first cycle.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	type ProductV2,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addHours, addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import {
	activateFutureStart,
	expectFutureStartScheduleCorrect,
	findLiveCustomerProduct,
} from "./utils/futureStartUtils";

const PRO_MONTHLY_PRICE = 20;
const PREPAID_MESSAGES = 200;
const PREPAID_PACK_SIZE = 100;
const PREPAID_PACK_PRICE = 10;
const WORDS_USED = 40;
const WORD_PRICE = 0.05;

type FeatureQuantities =
	SetPlansParamsV0Input["phases"][number]["plans"][number]["feature_quantities"];

/** Sets a plan to start a week out, then moves the clock past the start and activates it. */
const scheduleAndActivate = async ({
	customerId,
	pro,
	featureQuantities,
}: {
	customerId: string;
	pro: ProductV2;
	featureQuantities?: FeatureQuantities;
}) => {
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
	const { ctx, autumnV1, autumnV2_4, advancedTo, testClockId } = scenario;
	const startsAt = addDays(advancedTo, 7).getTime();

	await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
		customer_id: customerId,
		phases: [
			{
				starts_at: startsAt,
				plans: [{ plan_id: pro.id, feature_quantities: featureQuantities }],
			},
		],
	});
	const scheduled = await findLiveCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(scheduled.status).toBe(CusProductStatus.Scheduled);
	const schedule = await expectFutureStartScheduleCorrect({
		ctx,
		customerProduct: scheduled,
		startsAt,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		autumn: autumnV1,
		count: 0,
	});

	const stripeSubscriptionId = await activateFutureStart({
		ctx,
		customerId,
		testClockId: testClockId!,
		scheduleId: schedule.id,
		startsAt,
	});
	const activated = await findLiveCustomerProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(activated.id).toBe(scheduled.id);
	expect(activated.status).toBe(CusProductStatus.Active);
	expect(activated.subscription_ids).toEqual([stripeSubscriptionId]);
	return { ...scenario, startsAt };
};

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at activation: the start invoices the plan once with its prepaid quantity, and the balance resets a cycle later")}`,
	async () => {
		const customerId = "set-plans-future-start-activation-prepaid";
		const pro = products.pro({
			items: [
				items.prepaidMessages({
					billingUnits: PREPAID_PACK_SIZE,
					price: PREPAID_PACK_PRICE,
				}),
			],
		});

		const { autumnV1, autumnV2_4, startsAt } = await scheduleAndActivate({
			customerId,
			pro,
			featureQuantities: [
				{ feature_id: TestFeature.Messages, quantity: PREPAID_MESSAGES },
			],
		});

		const prepaidCharge = new Decimal(PREPAID_MESSAGES)
			.div(PREPAID_PACK_SIZE)
			.mul(PREPAID_PACK_PRICE);
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: prepaidCharge.plus(PRO_MONTHLY_PRICE).toNumber(),
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: TestFeature.Messages,
			remaining: PREPAID_MESSAGES,
			nextResetAt: addMonths(startsAt, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at activation: a metered price bills nothing at the start and its usage at the end of the first cycle")}`,
	async () => {
		const customerId = "set-plans-future-start-activation-metered";
		const pro = products.pro({ items: [items.consumableWords()] });

		const { autumnV1, autumnV2_4, ctx, testClockId, startsAt } =
			await scheduleAndActivate({ customerId, pro });

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: PRO_MONTHLY_PRICE,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});

		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: WORDS_USED,
		});
		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo: addHours(startsAt, 1).getTime(),
			anchorMs: addMonths(startsAt, 1).getTime(),
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: new Decimal(WORDS_USED)
				.mul(WORD_PRICE)
				.plus(PRO_MONTHLY_PRICE)
				.toNumber(),
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});
	},
);
