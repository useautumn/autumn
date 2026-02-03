import type {
	ApiFreeTrialV2,
	BillingPreviewResponse,
	CheckoutChange,
	CheckoutEntity,
} from "@autumn/shared";
import { format } from "date-fns";
import { formatAmount } from "./formatUtils";

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
	trialAvailable,
}: {
	preview?: BillingPreviewResponse;
	incoming?: CheckoutChange[];
	outgoing?: CheckoutChange[];
	entity?: CheckoutEntity;
	freeTrial?: ApiFreeTrialV2 | null;
	trialAvailable?: boolean;
}): string | undefined {
	if (!preview) return undefined;

	const { total, currency, line_items, next_cycle } = preview;
	const change = incoming?.[0];
	const scenario = change?.plan.customer_eligibility?.scenario;
	const outgoingPlanName = outgoing?.[0]?.plan.name;
	const incomingPlanName = change?.plan.name;
	const isRecurring = !!change?.plan.price?.interval;
	const entityName = entity?.name || entity?.id;
	const hasActiveTrial = freeTrial && trialAvailable;

	// Determine if this is a scheduled change (no immediate charges, changes next cycle)
	const isScheduledChange =
		line_items.length === 0 && total === 0 && next_cycle;

	// Build the action phrase
	let action = buildActionPhrase({
		scenario,
		outgoingPlanName,
		incomingPlanName,
		isRecurring,
	});

	// Add entity if present
	if (entityName) {
		action += ` for ${entityName}`;
	}

	// Build trial phrase if applicable
	const trialDuration = hasActiveTrial
		? formatTrialDuration(freeTrial)
		: null;

	// Handle negative amounts (refund/credit from previous plan)
	if (total < 0) {
		const creditAmount = formatAmount(Math.abs(total), currency);
		let sentence = `${action}. You'll receive a ${creditAmount} credit for unused time on your previous plan.`;

		if (hasActiveTrial && next_cycle) {
			const nextDate = format(new Date(next_cycle.starts_at), "d MMM yyyy");
			const nextAmount = formatAmount(next_cycle.total, currency);
			sentence += ` Includes a ${trialDuration} free trial, then you'll be charged ${nextAmount} on ${nextDate}.`;
		} else if (next_cycle) {
			const nextDate = format(new Date(next_cycle.starts_at), "d MMM yyyy");
			const nextAmount = formatAmount(next_cycle.total, currency);
			sentence += ` Your next charge of ${nextAmount} is on ${nextDate}.`;
		}

		return sentence;
	}

	// Handle free trial (no immediate payment, trial starts)
	if (hasActiveTrial && next_cycle) {
		const nextDate = format(new Date(next_cycle.starts_at), "d MMM yyyy");
		const nextAmount = formatAmount(next_cycle.total, currency);
		return `${action}. Includes a ${trialDuration} free trial, then you'll be charged ${nextAmount} on ${nextDate}.`;
	}

	// Handle scheduled changes (no immediate charges)
	if (isScheduledChange) {
		const effectiveDate = format(new Date(next_cycle.starts_at), "d MMM yyyy");
		return `${action} with ${formatAmount(total, currency)} due today. Changes take effect ${effectiveDate}.`;
	}

	// Standard format
	return `${action}. ${formatAmount(total, currency)} due today.`;
}
