import {
	formatMs,
	formatMsToDate,
} from "../../../utils/common/formatUtils/formatUnix";
import type { SetPlansErrorDetails } from "./setPlansErrorDetails";
import {
	boldText,
	plainText,
	type SetPlansTextPart,
	textPartsToText,
} from "./setPlansTextParts";

export type SetPlansErrorTextPart = SetPlansTextPart;

export type SetPlansErrorAction =
	| { type: "open_subscription"; stripeSubscriptionId: string }
	| { type: "pick_subscription" };

/** Line 1 says what's wrong; the hint says what to do, optionally led by one link. */
export type SetPlansErrorCopy = {
	line: SetPlansErrorTextPart[];
	hint?: {
		link?: { label: string; action: SetPlansErrorAction };
		text: string;
	};
};

/** Two dates on the same day only read in order with their times. */
const formatDatePair = ({
	firstMs,
	secondMs,
}: {
	firstMs: number;
	secondMs: number;
}) => {
	const sameDay = formatMsToDate(firstMs) === formatMsToDate(secondMs);
	const formatDate = sameDay ? formatMs : formatMsToDate;
	return { first: formatDate(firstMs), second: formatDate(secondMs) };
};

const plain = plainText;
const bold = boldText;

const DATE_LABELS: Record<
	Extract<SetPlansErrorDetails, { type: "date_order" }>["date"],
	string
> = {
	end_date: "The end date",
	billing_cycle_anchor: "The billing cycle anchor",
};

const BOUNDARY_COPY: Record<
	Extract<SetPlansErrorDetails, { type: "date_order" }>["boundary"],
	{ relation: string; hint: string }
> = {
	last_phase: {
		relation: "isn't after the last phase starts on",
		hint: "Move it after the last phase.",
	},
	next_phase: {
		relation: "is after the next phase starts on",
		hint: "Move it before the next phase.",
	},
	end_date: {
		relation: "is after the end date",
		hint: "Move it before the end date.",
	},
};

/** The one place every Set Plans error is worded, for the API message and the dashboard alike. */
export const setPlansErrorCopy = (
	details: SetPlansErrorDetails,
): SetPlansErrorCopy => {
	switch (details.type) {
		case "plan_on_another_subscription":
			return {
				line:
					details.conflict === "replaces"
						? [
								plain("Adding"),
								bold(details.requested_plan_name),
								plain("would replace"),
								bold(`${details.conflicting_plan_name},`),
								plain("which is billed on another subscription."),
							]
						: [
								bold(details.requested_plan_name),
								plain("is already billed on another subscription."),
							],
				hint: {
					link: {
						label: `Edit the ${details.subscription_plan_name} subscription`,
						action: {
							type: "open_subscription",
							stripeSubscriptionId: details.stripe_subscription_id,
						},
					},
					text: "to change it.",
				},
			};
		case "plan_outside_subscription":
			return {
				line: [
					bold(details.requested_plan_name),
					plain("is billed outside any Stripe subscription."),
				],
				hint: { text: "It can't be changed from a subscription." },
			};
		case "billing_interval_mismatch":
			return {
				line: [
					bold(details.requested_plan_name),
					plain(`bills ${details.requested_interval}, but the`),
					bold(details.subscription_plan_name),
					plain(`subscription bills ${details.subscription_interval}.`),
				],
				hint: {
					text: "Plans on one subscription must share a billing interval.",
				},
			};
		case "currency_mismatch":
			return {
				line: [
					plain("The"),
					bold(details.subscription_plan_name),
					plain("subscription bills in"),
					bold(`${details.subscription_currency.toUpperCase()},`),
					plain("but these plans bill in"),
					bold(`${details.requested_currency.toUpperCase()}.`),
				],
				hint: { text: "Plans on one subscription must share a currency." },
			};
		case "subscription_not_linked":
			return {
				line: [
					plain(
						"This subscription no longer has any of this customer's plans.",
					),
				],
				hint: {
					link: {
						label: "Pick another subscription",
						action: { type: "pick_subscription" },
					},
					text: "to continue.",
				},
			};
		case "ongoing_plan_clash":
			return {
				line: [
					bold(details.plan_name),
					plain(
						"is an ongoing plan, but a phase also lists it or another plan in its group.",
					),
				],
				hint: {
					text: "Move it into the phases, or remove it from the phase that claims it.",
				},
			};
		case "too_many_phases":
			return {
				line: [
					plain("This schedule needs"),
					bold(String(details.phase_count)),
					plain("phases, but Stripe allows at most"),
					bold(`${details.max_phases}.`),
				],
				hint: { text: "Remove or merge some phases." },
			};
		case "free_plan_needs_stripe":
			return {
				line: [
					plain("Connect Stripe to schedule a change from"),
					bold(`${details.plan_name}.`),
				],
				hint: { text: "Autumn runs the schedule on a $0 Stripe subscription." },
			};
		case "date_order": {
			const boundary = BOUNDARY_COPY[details.boundary];
			const dates = formatDatePair({
				firstMs: details.date_ms,
				secondMs: details.boundary_ms,
			});
			return {
				line: [
					plain(DATE_LABELS[details.date]),
					bold(dates.first),
					plain(boundary.relation),
					bold(`${dates.second}.`),
				],
				hint: { text: boundary.hint },
			};
		}
	}
};

/** The copy as one plain sentence, for API error messages. */
export const setPlansErrorCopyToText = ({ line, hint }: SetPlansErrorCopy) =>
	[
		textPartsToText(line),
		hint && [hint.link?.label, hint.text].filter(Boolean).join(" "),
	]
		.filter(Boolean)
		.join(" ");
