import { BillingInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { advanceStripeTestClock } from "@tests/utils/stripeUtils/testClock/advanceStripeTestClock";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { addDays, addMonths } from "date-fns";
import { CusService } from "@/internal/customers/CusService";
import type { RelistScenario, RelistStateSetup } from "./relistMatrix";
import { RELIST } from "./relistTypes";

const attachPro = async ({
	scenario,
	noBillingChanges = false,
}: {
	scenario: RelistScenario;
	noBillingChanges?: boolean;
}) => {
	const { autumnV1, customerId, entityId, catalog } = scenario;
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: catalog.pro.id,
		entity_id: entityId,
		options: [
			{ feature_id: TestFeature.Words, quantity: RELIST.wordsQuantity },
		],
		...(noBillingChanges && { no_billing_changes: true }),
	});
};

const advanceDays = async ({
	scenario,
	days,
}: {
	scenario: RelistScenario;
	days: number;
}) => {
	await advanceStripeTestClock({
		stripeCli: scenario.ctx.stripeCli,
		testClockId: scenario.testClockId!,
		targetSeconds: Math.floor(
			addDays(scenario.clockStartMs, days).getTime() / 1000,
		),
	});
};

/** Pro active in Autumn with no Stripe subscription (the prod case behind option 1). */
export const noSubState: RelistStateSetup = async ({ scenario }) => {
	await attachPro({ scenario, noBillingChanges: true });
	return { periodStartMs: scenario.clockStartMs };
};

export const activeState: RelistStateSetup = async ({ scenario }) => {
	await attachPro({ scenario });
	return { periodStartMs: scenario.clockStartMs };
};

/** Pro attached with a trial (scenario created with trialDays), so the Stripe sub is trialing. */
export const trialingState: RelistStateSetup = activeState;

/** Pro set to cancel at period end on day 5, before the re-list on day 10. */
export const cancelAtPeriodEndState: RelistStateSetup = async ({
	scenario,
}) => {
	await attachPro({ scenario });
	await advanceDays({ scenario, days: 5 });
	await scenario.autumnV1.subscriptions.update({
		customer_id: scenario.customerId,
		product_id: scenario.catalog.pro.id,
		entity_id: scenario.entityId,
		cancel_action: "cancel_end_of_cycle",
	});
	return { periodStartMs: scenario.clockStartMs };
};

/** Pro with a scheduled future phase at renewal (base price to $30), set on day 2. */
export const futurePhaseState: RelistStateSetup = async ({ scenario }) => {
	await attachPro({ scenario });
	await advanceDays({ scenario, days: 2 });
	await scenario.autumnV2_4.billing.setPlans({
		customer_id: scenario.customerId,
		...(scenario.entityId && { entity_id: scenario.entityId }),
		phases: [
			{
				starts_at: "now",
				plans: [
					{
						plan_id: scenario.catalog.pro.id,
						feature_quantities: [
							{ feature_id: TestFeature.Words, quantity: RELIST.wordsQuantity },
						],
					},
				],
			},
			{
				starts_at: addMonths(scenario.clockStartMs, 1).getTime(),
				plans: [
					{
						plan_id: scenario.catalog.pro.id,
						feature_quantities: [
							{ feature_id: TestFeature.Words, quantity: RELIST.wordsQuantity },
						],
						customize: {
							price: {
								amount: RELIST.changedProPrice,
								interval: BillingInterval.Month,
							},
						},
					},
				],
			},
		],
	});
	return { periodStartMs: scenario.clockStartMs };
};

/** Pro with a pending billing-cycle anchor reset on day 25, set on day 2. */
export const pendingAnchorState: RelistStateSetup = async ({ scenario }) => {
	await attachPro({ scenario });
	await advanceDays({ scenario, days: 2 });
	await scenario.autumnV2_4.billing.setPlans({
		customer_id: scenario.customerId,
		...(scenario.entityId && { entity_id: scenario.entityId }),
		phases: [
			{
				starts_at: "now",
				billing_cycle_anchor: addDays(scenario.clockStartMs, 25).getTime(),
				plans: [
					{
						plan_id: scenario.catalog.pro.id,
						feature_quantities: [
							{ feature_id: TestFeature.Words, quantity: RELIST.wordsQuantity },
						],
					},
				],
			},
		],
	});
	return { periodStartMs: scenario.clockStartMs };
};

/** Pro's renewal payment fails, leaving the Stripe sub past_due; the re-list happens 10 days later. */
export const pastDueState: RelistStateSetup = async ({ scenario }) => {
	await attachPro({ scenario });
	const stripeCli = scenario.ctx.stripeCli;
	const stripeCustomerId = (
		await CusService.getFull({
			ctx: scenario.ctx,
			idOrInternalId: scenario.customerId,
		})
	).processor!.id;
	const failing = await stripeCli.paymentMethods.attach(
		"pm_card_chargeCustomerFail",
		{
			customer: stripeCustomerId,
		},
	);
	await stripeCli.customers.update(stripeCustomerId, {
		invoice_settings: { default_payment_method: failing.id },
	});
	const renewedAtMs = await advanceToNextInvoice({
		stripeCli,
		testClockId: scenario.testClockId!,
		currentEpochMs: scenario.clockStartMs,
		withPause: true,
	});
	return { periodStartMs: renewedAtMs };
};

/** Pro on one Stripe sub and the add-on on a second sub. */
export const multiSubState: RelistStateSetup = async ({ scenario }) => {
	await attachPro({ scenario });
	const stripeCustomerId = (
		await CusService.getFull({
			ctx: scenario.ctx,
			idOrInternalId: scenario.customerId,
		})
	).processor!.id;
	const [proSubscription] = (
		await scenario.ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
		})
	).data;
	await scenario.autumnV1.billing.attach({
		customer_id: scenario.customerId,
		product_id: scenario.catalog.addOn.id,
		entity_id: scenario.entityId,
		new_billing_subscription: true,
	});
	return {
		periodStartMs: scenario.clockStartMs,
		params: { stripe_subscription_id: proSubscription!.id },
	};
};
