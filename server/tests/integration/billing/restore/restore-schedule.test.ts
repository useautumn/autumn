import { expect, test } from "bun:test";
import { type CreateScheduleParamsV0Input, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { expectStripeSubscriptionCorrect } from "../utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import {
	corruptStripeSubscription,
	listActiveStripeSubscriptions,
} from "./utils/corruptStripeSubscription";

const stripeCustomerIdFor = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}
	return stripeCustomerId;
};

test.concurrent(`${chalk.yellowBright("restore-schedule 5: two-phase schedule, release schedule, restore re-creates phases")}`, async () => {
	const customerId = "restore-schedule-multi-phase";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyWords({ includedUsage: 25 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	const now = Date.now();
	const params: CreateScheduleParamsV0Input = {
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: pro.id }],
			},
		],
	};

	const response = await autumnV1.billing.createSchedule(params);
	expect(response.status).toBe("created");
	expect(response.phases).toHaveLength(2);

	const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
	const subs = await listActiveStripeSubscriptions({ ctx, stripeCustomerId });
	expect(subs.length).toBe(1);
	const sub = subs[0];

	await corruptStripeSubscription({
		ctx,
		subscriptionId: sub.id,
		mutations: { releaseSchedule: true },
	});

	await autumnV2_2.billing.restore({ customer_id: customerId });

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
