/**
 * Regression: downgrading to Free while the paid product is still trialing must
 * schedule the Free switch at the TRIAL END, not now + 1 billing cycle.
 *
 * Reproduced from a production incident (org flexling, customer
 * k97c0p8y0wfg3066cjznhzhnc186jmr9): a Pro product on a 21-day trial was
 * downgraded to Free mid-trial via /v1/attach. The resulting subscription got
 * cancel_at = now + 1 month (trial end ignored), so the trial converted, Stripe
 * billed the paid plan, and Free only took over a month later.
 *
 * Root cause: setupBillingCycleAnchor returned "now" for the trialing -> Free
 * transition (trialContext.trialEndsAt is undefined for Free) instead of falling
 * back to the existing subscription's trial end. Both attach front-ends route
 * through that shared builder:
 *  - legacy /v1/attach  -> handleScheduleFunction2 -> legacyAttach -> billingActions.attach
 *  - native billing.attach (V2)
 *
 * Pre-fix: scheduled Free starts ~1 month out (now + 1 cycle).
 * Post-fix: scheduled Free starts at the trial end.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectProductScheduled } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const TRIAL_DAYS = 21;
const DAYS_INTO_TRIAL = 13;

const expectScheduledFreeAtTrialEnd = ({
	customer,
	freeId,
	trialEndsAt,
}: {
	customer: ApiCustomerV3;
	freeId: string;
	trialEndsAt: number;
}) => {
	const scheduledFree = (customer.products ?? []).find(
		(p) => p.id === freeId && p.status === "scheduled",
	);
	expect(scheduledFree, "Free should be scheduled").toBeDefined();

	const startsAt = scheduledFree?.started_at;
	const diffFromTrialEnd = Math.abs((startsAt ?? 0) - trialEndsAt);
	expect(
		diffFromTrialEnd < ms.days(1),
		`Scheduled Free should start at trial end (${new Date(trialEndsAt).toISOString()}), but starts at ${startsAt ? new Date(startsAt).toISOString() : "undefined"} (diff ${Math.round(diffFromTrialEnd / ms.days(1))}d)`,
	).toBe(true);
};

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy /v1/attach (the exact production path for sub-1.2 orgs like flexling)
// ═══════════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("trial-downgrade-free-anchor 1: legacy /v1/attach to Free mid-trial schedules at trial end")}`,
	async () => {
		const customerId = "trial-downgrade-free-anchor-v1";

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			trialDays: TRIAL_DAYS,
			cardRequired: true,
		});
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial, free] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		const trialEndsAt = advancedTo + ms.days(TRIAL_DAYS);

		await expectProductTrialing({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			productId: proTrial.id,
			trialEndsAt,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(advancedTo),
			numberOfDays: DAYS_INTO_TRIAL,
			waitForSeconds: 15,
		});

		// Downgrade to Free via legacy REST /v1/attach (what production did).
		await autumnV1.attach({ customer_id: customerId, product_id: free.id });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductScheduled({ customer, productId: free.id });
		expectScheduledFreeAtTrialEnd({ customer, freeId: free.id, trialEndsAt });
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// Native billing.attach (V2) — same bug, shared anchor builder
// ═══════════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("trial-downgrade-free-anchor 2: native billing.attach to Free mid-trial schedules at trial end")}`,
	async () => {
		const customerId = "trial-downgrade-free-anchor-v2";

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			trialDays: TRIAL_DAYS,
			cardRequired: true,
		});
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [proTrial, free] }),
				],
				actions: [s.billing.attach({ productId: proTrial.id })],
			});

		const trialEndsAt = advancedTo + ms.days(TRIAL_DAYS);

		await expectProductTrialing({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			productId: proTrial.id,
			trialEndsAt,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(advancedTo),
			numberOfDays: DAYS_INTO_TRIAL,
			waitForSeconds: 15,
		});

		// Downgrade to Free via native V2 billing.attach.
		await autumnV2_2.billing.attach({ customer_id: customerId, plan_id: free.id });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductScheduled({ customer, productId: free.id });
		expectScheduledFreeAtTrialEnd({ customer, freeId: free.id, trialEndsAt });
	},
);
