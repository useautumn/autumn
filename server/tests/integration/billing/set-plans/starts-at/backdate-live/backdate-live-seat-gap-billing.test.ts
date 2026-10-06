/**
 * A backdate over a live subscription bills the plan's paid seats for the time before that
 * subscription started exactly as it bills the plan's base price: pro rata, or every cycle the
 * gap reaches in full. The seats keep their count, and the paid live period is never billed again.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectPreviewWarning } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	buildSeatPlans,
	PARENT_PRICE,
	SEAT_PRICE,
} from "@tests/integration/licenses/billing/create-schedule/license-quantities/utils/scheduleSeatTestUtils";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	expectEachPeriodBilledOnce,
	expectedBackdateGapCharge,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const PAID_SEATS = 5;
const SEATS_MONTHLY_PRICE = PAID_SEATS * SEAT_PRICE;
const LIVE_PERIOD_TOTAL = PARENT_PRICE + SEATS_MONTHLY_PRICE;

const initLiveSeatPlanScenario = async ({
	customerId,
	productPrefix,
}: {
	customerId: string;
	productPrefix: string;
}) => {
	const { parent, seat } = buildSeatPlans({ prefix: productPrefix });
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [parent, seat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: seat.id,
				included: 0,
			}),
			s.billing.attach({
				productId: parent.id,
				licenseQuantities: [
					{ licenseProductId: seat.id, quantity: PAID_SEATS },
				],
			}),
			s.advanceTestClock({ days: 10 }),
		],
	});
	return { ...scenario, parent, seat };
};

for (const { prorationBehavior, daysBeforeLiveStart, productPrefix } of [
	{
		prorationBehavior: "prorate_immediately",
		daysBeforeLiveStart: 13,
		productPrefix: "spbl-seat-prorate",
	},
	{
		prorationBehavior: "bill_difference",
		daysBeforeLiveStart: 40,
		productPrefix: "spbl-seat-whole",
	},
] as const) {
	test.concurrent(
		`${chalk.yellowBright(`set-plans backdate live: ${prorationBehavior} bills the paid seats for the ${daysBeforeLiveStart} days before the live start with the base price`)}`,
		async () => {
			const customerId = `set-plans-backdate-live-seat-gap-${prorationBehavior}`;
			const { autumnV1, autumnV2_4, ctx, parent, seat } =
				await initLiveSeatPlanScenario({ customerId, productPrefix });
			const live = await liveSubscriptionPeriod({ ctx, customerId });
			const backdatedStart = live.startMs - ms.days(daysBeforeLiveStart);
			const gapChargeFor = (cyclePrice: number) =>
				expectedBackdateGapCharge({
					cyclePrice,
					backdatedStartMs: backdatedStart,
					liveStartMs: live.startMs,
					prorationBehavior,
				});
			const gapCharge = new Decimal(gapChargeFor(PARENT_PRICE))
				.plus(gapChargeFor(SEATS_MONTHLY_PRICE))
				.toNumber();
			const params: SetPlansParamsV0Input = {
				customer_id: customerId,
				phases: [
					{
						proration_behavior: prorationBehavior,
						starts_at: backdatedStart,
						plans: [{ plan_id: parent.id }],
					},
				],
			};

			const preview = await autumnV2_4.billing.previewSetPlans(params);
			expect(preview.total).toBeCloseTo(gapCharge, 2);
			expectPreviewWarning({
				preview,
				type: "subscription_recreated_backdated",
				messageContains: ["is billed now for the time before"],
			});

			await autumnV2_4.billing.setPlans(params);

			await expectCustomerInvoiceCorrect({
				customerId,
				autumn: autumnV1,
				count: 2,
				latestTotal: preview.total,
			});
			await expectReplacedSubscriptionCancelledQuietly({
				ctx,
				subscriptionId: live.subscription.id,
				invoiceCountBefore: live.invoiceCount,
			});
			await expectRecreatedSubscriptionCorrect({
				ctx,
				customerId,
				replacedSubscriptionId: live.subscription.id,
				startMs: backdatedStart,
				periodEndMs: live.periodEndMs,
				renewalTotal: LIVE_PERIOD_TOTAL,
			});
			await expectEachPeriodBilledOnce({
				ctx,
				customerId,
				periods: [
					{ startMs: backdatedStart, endMs: live.startMs, total: gapCharge },
					{
						startMs: live.periodStartMs,
						endMs: live.periodEndMs,
						total: LIVE_PERIOD_TOTAL,
					},
				],
			});
			expectCustomerLicenses({
				customer: await autumnV2_4.customers.get<ApiCustomerV5>(customerId),
				count: 1,
				licenses: [
					{
						license_plan_id: seat.id,
						parent_plan_id: parent.id,
						granted: PAID_SEATS,
						paid_quantity: PAID_SEATS,
					},
				],
			});
		},
	);
}
