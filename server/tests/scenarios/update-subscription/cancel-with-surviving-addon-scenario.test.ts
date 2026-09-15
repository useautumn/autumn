import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Setup-only scenarios for the "cancel a plan that shares its subscription
 * with an add-on" flow. This is the shape behind the Resend incident: the
 * paid plan is dropped by a Stripe schedule rather than a plain cancel_at.
 *
 *   1. leaves a customer mid-cancel with the two-phase schedule in place
 *   2. same, then strands it the way a failed schedule rebuild used to:
 *      good schedule released, bare from_subscription schedule left behind
 *
 * Advance the test clock past the period end in the Stripe dashboard, then
 * check the customer in the Autumn dashboard and the subscription in Stripe.
 */

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

const setupCancelingCustomer = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const { free, pro, automations } = buildProducts({ customerId });

	const { autumnV2_3, ctx, testClockId } = await initScenario({
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

	await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});
	const subscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);

	return {
		ctx,
		subscriptionId,
		scheduleId: subscription.schedule as string,
		testClockId,
	};
};

const printState = ({
	title,
	customerId,
	subscriptionId,
	scheduleId,
	testClockId,
}: {
	title: string;
	customerId: string;
	subscriptionId: string;
	scheduleId: string | null;
	testClockId?: string;
}) =>
	console.log(
		chalk.cyanBright(
			`\n\n=== ${title} ===\n` +
				`customer_id:   ${customerId}\n` +
				`subscription:  ${subscriptionId}\n` +
				`schedule:      ${scheduleId ?? "none"}\n` +
				`test clock:    ${testClockId ?? "none"}\n` +
				`Advance the test clock past the period end, then compare the Autumn customer with the Stripe subscription.\n` +
				`=============================\n`,
		),
	);

test(`${chalk.yellowBright("setup: pro canceling at period end with an add-on that survives")}`, async () => {
	const customerId = "scenario-cancel-surviving-addon";
	const state = await setupCancelingCustomer({ customerId });

	printState({
		title: "Canceling with surviving add-on",
		customerId,
		...state,
	});
});

test(`${chalk.yellowBright("setup: same customer, schedule stranded like a failed rebuild")}`, async () => {
	const customerId = "scenario-cancel-stranded-schedule";
	const { ctx, subscriptionId, scheduleId, testClockId } =
		await setupCancelingCustomer({ customerId });

	// Mirror the wreckage a failed release + recreate used to leave behind.
	await ctx.stripeCli.subscriptionSchedules.release(scheduleId);
	const bareSchedule = await ctx.stripeCli.subscriptionSchedules.create({
		from_subscription: subscriptionId,
	});

	printState({
		title: "Stranded schedule (bare from_subscription, release on end)",
		customerId,
		subscriptionId,
		scheduleId: bareSchedule.id,
		testClockId,
	});
});
