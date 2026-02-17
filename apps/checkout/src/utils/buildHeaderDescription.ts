import type {
	ApiFreeTrialV2,
	BillingPreviewResponse,
	CheckoutChange,
	CheckoutEntity,
	LineItemDiscount,
} from "@autumn/shared";
import { format } from "date-fns";
import { formatAmount } from "./formatUtils";

/**
 * Builds a phrase describing applied discounts.
 * Examples: "Discount code 20OFF applied for 20% off.", "Discount codes 20OFF (20% off) and SAVE10 ($10 off) applied."
 */
function buildDiscountPhrase({
	lineItems,
	currency,
}: {
	lineItems: BillingPreviewResponse["line_items"];
	currency: string;
}): string {
	// Collect all discounts from line items
	const allDiscounts = lineItems.flatMap((item) => item.discounts);
	if (allDiscounts.length === 0) return "";

	// Deduplicate by couponName (or stripeCouponId as fallback)
	const uniqueDiscounts = new Map<string, LineItemDiscount>();
	for (const discount of allDiscounts) {
		const key = discount.couponName || discount.stripeCouponId || "unknown";
		if (!uniqueDiscounts.has(key)) {
			uniqueDiscounts.set(key, discount);
		}
	}

	const discountList = Array.from(uniqueDiscounts.values());
	if (discountList.length === 0) return "";

	// Format each discount
	const formatDiscount = (d: LineItemDiscount): string => {
		const name = d.couponName || d.stripeCouponId || "Discount";
		if (d.percentOff) {
			return `${name} applied for ${d.percentOff}% off`;
		}
		return `${name} applied for ${formatAmount(d.amountOff, currency)} off`;
	};

	if (discountList.length === 1) {
		return `Discount code ${formatDiscount(discountList[0])}.`;
	}

	// Multiple discounts
	const formatted = discountList.map(formatDiscount);
	const lastDiscount = formatted.pop();
	return `Discount codes ${formatted.join(", ")} and ${lastDiscount}.`;
}

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
	hasActiveTrial,
}: {
	preview?: BillingPreviewResponse;
	incoming?: CheckoutChange[];
	outgoing?: CheckoutChange[];
	entity?: CheckoutEntity;
	freeTrial?: ApiFreeTrialV2 | null;
	hasActiveTrial?: boolean;
}): string | undefined {
	if (!preview) return undefined;

	const { total, currency, line_items, next_cycle } = preview;
	const change = incoming?.[0];
	const scenario = change?.plan.customer_eligibility?.scenario;
	const outgoingPlanName = outgoing?.[0]?.plan.name;
	const incomingPlanName = change?.plan.name;
	const isRecurring = !!change?.plan.price?.interval;
	const entityName = entity?.name || entity?.id;

	// Determine if this is a scheduled change (no immediate charges, changes next cycle)
	const isScheduledChange =
		line_items.length === 0 && total === 0 && next_cycle;

	// Build discount phrase
	const discountPhrase = buildDiscountPhrase({ lineItems: line_items, currency });

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

	// Handle credit from excess refund (unused time on previous plan exceeds new charge)
	const credit = preview.credit;
	if (credit) {
		const creditAmount = formatAmount(credit.amount, currency);
		let sentence = `${action}.${discountPhrase ? ` ${discountPhrase}` : ""} You'll receive a ${creditAmount} credit applied to your next invoice.`;

		if (hasActiveTrial && next_cycle) {
			const nextDate = format(new Date(next_cycle.starts_at), "do MMMM yyyy");
			const nextAmount = formatAmount(next_cycle.total, currency);
			sentence += ` Includes a ${trialDuration} free trial, then you'll be charged ${nextAmount} on ${nextDate}.`;
		} else if (next_cycle) {
			const nextDate = format(new Date(next_cycle.starts_at), "do MMMM yyyy");
			const nextAmount = formatAmount(next_cycle.total, currency);
			sentence += ` Your next charge of ${nextAmount} is on ${nextDate}.`;
		}

		return sentence;
	}

	// Handle free trial (no immediate payment, trial starts)
	if (hasActiveTrial && next_cycle) {
		const nextDate = format(new Date(next_cycle.starts_at), "do MMMM yyyy");
		const nextAmount = formatAmount(next_cycle.total, currency);
		return `${action}.${discountPhrase ? ` ${discountPhrase}` : ""} Includes a ${trialDuration} free trial, then you'll be charged ${nextAmount} on ${nextDate}.`;
	}

	// Handle scheduled changes (no immediate charges)
	if (isScheduledChange) {
		const effectiveDate = format(new Date(next_cycle.starts_at), "do MMMM yyyy");
		return `${action}.${discountPhrase ? ` ${discountPhrase}` : ""} ${formatAmount(total, currency)} due today. Changes take effect ${effectiveDate}.`;
	}

	// Standard format
	return `${action}.${discountPhrase ? ` ${discountPhrase}` : ""} ${formatAmount(total, currency)} due today.`;
}
