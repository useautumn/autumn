import { expect, test } from "bun:test";
import {
	type SetPlansErrorDetails,
	setPlansErrorCopy,
	setPlansErrorCopyToText,
} from "@autumn/shared";

const NOV_1_2026 = new Date(2026, 10, 1, 12).getTime();
const OCT_15_2026 = new Date(2026, 9, 15, 12).getTime();
const JAN_1_2026_9AM = new Date(2026, 0, 1, 9).getTime();
const JAN_1_2026_NOON = new Date(2026, 0, 1, 12).getTime();

const EVERY_ERROR: [SetPlansErrorDetails, string][] = [
	[
		{
			type: "plan_on_another_subscription",
			conflict: "replaces",
			requested_plan_name: "Free",
			conflicting_plan_name: "Pro",
			stripe_subscription_id: "sub_b",
			subscription_plan_name: "Pro",
		},
		"Adding Free would replace Pro, which is billed on another subscription. Edit the Pro subscription to change it.",
	],
	[
		{
			type: "plan_on_another_subscription",
			conflict: "already_billed",
			requested_plan_name: "Seats",
			conflicting_plan_name: "Seats",
			stripe_subscription_id: "sub_b",
			subscription_plan_name: "Pro",
		},
		"Seats is already billed on another subscription. Edit the Pro subscription to change it.",
	],
	[
		{ type: "plan_outside_subscription", requested_plan_name: "Credits Pack" },
		"Credits Pack is billed outside any Stripe subscription. It can't be changed from a subscription.",
	],
	[
		{
			type: "billing_interval_mismatch",
			requested_plan_name: "Annual Support",
			requested_interval: "every year",
			subscription_plan_name: "Pro",
			subscription_interval: "every month",
		},
		"Annual Support bills every year, but the Pro subscription bills every month. Plans on one subscription must share a billing interval.",
	],
	[
		{
			type: "currency_mismatch",
			subscription_plan_name: "Pro",
			subscription_currency: "eur",
			requested_currency: "usd",
		},
		"The Pro subscription bills in EUR, but these plans bill in USD. Plans on one subscription must share a currency.",
	],
	[
		{ type: "subscription_not_linked", stripe_subscription_id: "sub_gone" },
		"This subscription no longer has any of this customer's plans. Pick another subscription to continue.",
	],
	[
		{ type: "ongoing_plan_clash", plan_name: "Pro" },
		"Pro is an ongoing plan, but a phase also lists it or another plan in its group. Move it into the phases, or remove it from the phase that claims it.",
	],
	[
		{ type: "too_many_phases", phase_count: 12, max_phases: 10 },
		"This schedule needs 12 phases, but Stripe allows at most 10. Remove or merge some phases.",
	],
	[
		{ type: "free_plan_needs_stripe", plan_name: "Free" },
		"Connect Stripe to schedule a change from Free. Autumn runs the schedule on a $0 Stripe subscription.",
	],
	[
		{
			type: "date_order",
			date: "end_date",
			date_ms: OCT_15_2026,
			boundary: "last_phase",
			boundary_ms: NOV_1_2026,
		},
		"The end date 15 Oct 2026 isn't after the last phase starts on 01 Nov 2026. Move it after the last phase.",
	],
	[
		{
			type: "date_order",
			date: "billing_cycle_anchor",
			date_ms: JAN_1_2026_NOON,
			boundary: "end_date",
			boundary_ms: JAN_1_2026_9AM,
		},
		"The billing cycle anchor 01 Jan 2026 12:00:00 is after the end date 01 Jan 2026 09:00:00. Move it before the end date.",
	],
];

test("every Set Plans error reads as one sentence from the shared copy", () => {
	expect(
		EVERY_ERROR.map(([details]) =>
			setPlansErrorCopyToText(setPlansErrorCopy(details)),
		),
	).toEqual(EVERY_ERROR.map(([, text]) => text));
});

test("only the names are bold, and links carry the action the dashboard runs", () => {
	const { line, hint } = setPlansErrorCopy(EVERY_ERROR[0][0]);

	expect(line.filter(({ bold }) => bold).map(({ text }) => text)).toEqual([
		"Free",
		"Pro,",
	]);
	expect(hint?.link?.action).toEqual({
		type: "open_subscription",
		stripeSubscriptionId: "sub_b",
	});
});
