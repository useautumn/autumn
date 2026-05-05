import type {
	ApiFreeTrialV2,
	BillingPreviewResponse,
	CheckoutEntity,
	GetCheckoutResponse,
} from "@autumn/shared";
import { format } from "date-fns";
import { formatAmount } from "./formatUtils";
import { getCheckoutPreviewIntent } from "./getCheckoutPreviewIntent";

type CheckoutPreview = GetCheckoutResponse["preview"];
type CheckoutPreviewChange = CheckoutPreview["incoming"][number];

/**
 * Builds the action phrase based on the checkout scenario.
 * Examples: "Upgrading from Pro to Enterprise", "Subscribing to Enterprise", "Purchasing Starter"
 */
function buildActionPhrase({
	scenario,
	outgoingPlanName,
	incomingPlanName,
	isRecurring,
}: {
	scenario?: string;
	outgoingPlanName?: string;
	incomingPlanName?: string;
	isRecurring: boolean;
}): string {
	if (outgoingPlanName) {
		const toClause = incomingPlanName ? ` to ${incomingPlanName}` : "";
		if (scenario === "upgrade") {
			return `Upgrading from ${outgoingPlanName}${toClause}`;
		}
		if (scenario === "downgrade") {
			return `Downgrading from ${outgoingPlanName}${toClause}`;
		}
		return `Changing from ${outgoingPlanName}${toClause}`;
	}

	if (incomingPlanName) {
		return isRecurring
			? `Subscribing to ${incomingPlanName}`
			: `Purchasing ${incomingPlanName}`;
	}

	return isRecurring ? "New subscription" : "New purchase";
}

/**
 * Formats the free trial duration into a human-readable string.
 * Examples: "14-day", "1-month", "7-day"
 */
function formatTrialDuration(freeTrial: ApiFreeTrialV2): string {
	const { duration_length, duration_type } = freeTrial;
	return `${duration_length}-${duration_type}`;
}

function formatNextCycleAmount({
	nextCycle,
	currency,
}: {
	nextCycle?: BillingPreviewResponse["next_cycle"];
	currency: string;
}): string {
	if (!nextCycle) return formatAmount(0, currency);

	const amount = formatAmount(nextCycle.total, currency);
	const hasUsage = (nextCycle.usage_line_items?.length ?? 0) > 0;

	return hasUsage ? `${amount} + usage` : amount;
}

/**
 * Builds the header description for the checkout page.
 * Returns a natural sentence describing the checkout action, amount, and timing.
 */
export function buildHeaderDescription({
	preview,
	incoming,
	outgoing,
	entity,
	freeTrial,
	hasActiveTrial,
}: {
	preview?: CheckoutPreview;
	incoming?: CheckoutPreviewChange[];
	outgoing?: CheckoutPreviewChange[];
	entity?: CheckoutEntity;
	freeTrial?: ApiFreeTrialV2 | null;
	hasActiveTrial?: boolean;
}): string | undefined {
	if (!preview) return undefined;

	const isUpdateSubscriptionPreview =
		preview.object === "update_subscription_preview";
	const previewIntent = getCheckoutPreviewIntent({ preview });

	const { total, currency, line_items, next_cycle } = preview;
	const change = incoming?.[0];
	const scenario = change?.plan?.customer_eligibility?.scenario;
	const outgoingPlanName =
		outgoing?.[0]?.plan?.name || outgoing?.[0]?.plan_id;
	const incomingPlanName = change?.plan?.name || change?.plan_id;
	const isRecurring = !!change?.plan?.price?.interval;
	const entityName = entity?.name || entity?.id;

	// Determine if this is a scheduled change (no immediate charges, changes next cycle)
	const isScheduledChange =
		line_items.length === 0 && total === 0 && next_cycle;

	// Build the action phrase
	let action = isUpdateSubscriptionPreview
		? incomingPlanName
			? `Update plan ${incomingPlanName}`
			: "Update plan"
		: buildActionPhrase({
				scenario,
				outgoingPlanName,
				incomingPlanName,
				isRecurring,
			});

	// Add entity if present
	if (entityName && !isUpdateSubscriptionPreview) {
		action += ` for ${entityName}`;
	}

	// Build trial phrase if applicable
	const trialDuration =
		hasActiveTrial && freeTrial ? formatTrialDuration(freeTrial) : null;

	// Handle credit from excess refund (unused time on previous plan exceeds new charge)
	const credit = preview.total < 0 ? Math.abs(preview.total) : 0;
	if (credit) {
		const creditAmount = formatAmount(credit, currency);
		let sentence = `${action}. You'll receive a ${creditAmount} credit applied to your next invoice.`;

		if (hasActiveTrial && next_cycle) {
			const nextDate = format(new Date(next_cycle.starts_at), "do MMMM yyyy");
			const nextAmount = formatNextCycleAmount({
				nextCycle: next_cycle,
				currency,
			});
			sentence += ` Includes a ${trialDuration} free trial, then you'll be charged ${nextAmount} on ${nextDate}.`;
		} else if (next_cycle) {
			const nextDate = format(new Date(next_cycle.starts_at), "do MMMM yyyy");
			const nextAmount = formatNextCycleAmount({
				nextCycle: next_cycle,
				currency,
			});
			sentence += ` Your next charge of ${nextAmount} is on ${nextDate}.`;
		}

		return sentence;
	}

	// Handle free trial (no immediate payment, trial starts)
	if (hasActiveTrial && next_cycle) {
		const nextDate = format(new Date(next_cycle.starts_at), "do MMMM yyyy");
		const nextAmount = formatNextCycleAmount({
			nextCycle: next_cycle,
			currency,
		});
		return `${action}. Includes a ${trialDuration} free trial, then you'll be charged ${nextAmount} on ${nextDate}.`;
	}

	// Handle scheduled changes (no immediate charges)
	if (isScheduledChange) {
		if (previewIntent === "update_quantity") {
			return `${action}. ${formatAmount(total, currency)} due today.`;
		}

		const effectiveDate = format(new Date(next_cycle.starts_at), "do MMMM yyyy");
		return `${action}. ${formatAmount(total, currency)} due today. Changes take effect ${effectiveDate}.`;
	}

	// Standard format
	return `${action}. ${formatAmount(total, currency)} due today.`;
}
