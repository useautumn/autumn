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

		await autumnV1.attach({ customer_id: customerId, product_id: free.id });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductScheduled({ customer, productId: free.id });
		expectScheduledFreeAtTrialEnd({ customer, freeId: free.id, trialEndsAt });
	},
);

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

		await autumnV2_2.billing.attach({ customer_id: customerId, plan_id: free.id });

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductScheduled({ customer, productId: free.id });
		expectScheduledFreeAtTrialEnd({ customer, freeId: free.id, trialEndsAt });
	},
);
