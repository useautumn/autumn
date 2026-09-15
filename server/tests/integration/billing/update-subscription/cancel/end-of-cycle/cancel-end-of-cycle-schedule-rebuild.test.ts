/**
 * Cancelling a plan that shares its Stripe subscription with an add-on is done
 * with a two-phase schedule. Rebuilding that schedule (a repeat cancel, or a
 * second cancel racing the first) must always leave a schedule that still
 * drops the paid plan at period end and keeps the add-on.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";

const buildProducts = ({ customerId }: { customerId: string }) => ({
	free: products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 10 })],
		isDefault: true,
		group: `${customerId}_main`,
	}),
	pro: products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		group: `${customerId}_main`,
	}),
	automations: products.base({
		id: "automations",
		items: [items.consumableWords()],
		group: `${customerId}_auto`,
	}),
});

const setupWithBothPlans = async ({ customerId }: { customerId: string }) => {
	const { free, pro, automations } = buildProducts({ customerId });
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, automations] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: automations.id }),
		],
	});
	return { ...scenario, free, pro, automations };
};

const cancelProEndOfCycle = ({
	autumn,
	customerId,
	proId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
	proId: string;
}) =>
	autumn.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: proId,
		cancel_action: "cancel_end_of_cycle",
	});

const expectScheduleDropsProAtPeriodEnd = async ({
	stripeCli,
	subscriptionId,
}: {
	stripeCli: Stripe;
	subscriptionId: string;
}) => {
	const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subscription.schedule).not.toBeNull();

	const schedule = await stripeCli.subscriptionSchedules.retrieve(
		subscription.schedule as string,
	);
	expect(schedule.phases).toHaveLength(2);
	expect(schedule.end_behavior).toBe("release");
	expect(schedule.phases[0].items).toHaveLength(2);
	expect(schedule.phases[1].items).toHaveLength(1);
	return schedule;
};

test.concurrent(
	`${chalk.yellowBright("cancel EOC rebuild: repeat cancel keeps a two-phase schedule")}`,
	async () => {
		const customerId = "cancel-eoc-rebuild-repeat";
		const { autumnV2_3, ctx, free, pro, automations } =
			await setupWithBothPlans({ customerId });
		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		await cancelProEndOfCycle({
			autumn: autumnV2_3,
			customerId,
			proId: pro.id,
		});
		await cancelProEndOfCycle({
			autumn: autumnV2_3,
			customerId,
			proId: pro.id,
		});

		await expectScheduleDropsProAtPeriodEnd({
			stripeCli: ctx.stripeCli,
			subscriptionId,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			canceling: [pro.id],
			scheduled: [free.id],
			active: [automations.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel EOC rebuild: two cancels racing still leave one valid schedule")}`,
	async () => {
		const customerId = "cancel-eoc-rebuild-race";
		const { autumnV2_3, ctx, free, pro, automations } =
			await setupWithBothPlans({ customerId });
		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		// The customer lock should serialise these; either way Stripe must end up consistent.
		const outcomes = await Promise.allSettled([
			cancelProEndOfCycle({ autumn: autumnV2_3, customerId, proId: pro.id }),
			cancelProEndOfCycle({ autumn: autumnV2_3, customerId, proId: pro.id }),
		]);
		expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(
			true,
		);

		await expectScheduleDropsProAtPeriodEnd({
			stripeCli: ctx.stripeCli,
			subscriptionId,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			canceling: [pro.id],
			scheduled: [free.id],
			active: [automations.id],
		});
	},
);
