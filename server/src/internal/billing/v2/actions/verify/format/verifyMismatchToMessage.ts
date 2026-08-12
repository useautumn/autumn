import type {
	BasePriceMismatch,
	ItemMismatch,
	ScheduleMismatch,
	SubscriptionMismatch,
} from "@autumn/shared";
import { formatUnixToDateTime } from "@/utils/genUtils";

const INTERVAL_LABELS: Record<string, string> = {
	month: "mo",
	year: "yr",
	week: "wk",
	quarter: "qtr",
	semi_annual: "6mo",
};

type PriceDisplay = {
	plan_name?: string;
	price_amount?: number;
	price_interval?: string;
	price_interval_count?: number;
};

/** "Pro (Yearly) $3000/yr" — plan/price label when the mismatch carries it. */
const planPriceLabel = (mismatch: PriceDisplay): string | null => {
	if (mismatch.price_amount === undefined) return mismatch.plan_name ?? null;
	const interval = mismatch.price_interval
		? (INTERVAL_LABELS[mismatch.price_interval] ?? mismatch.price_interval)
		: undefined;
	const count =
		mismatch.price_interval_count && mismatch.price_interval_count > 1
			? mismatch.price_interval_count
			: "";
	const price = `$${mismatch.price_amount}${interval ? `/${count}${interval}` : ""}`;
	return mismatch.plan_name ? `${mismatch.plan_name} ${price}` : price;
};

const phaseSuffix = (mismatch: SubscriptionMismatch): string =>
	"phase_starts_at" in mismatch && mismatch.phase_starts_at !== undefined
		? ` (in future phase starting ${formatUnixToDateTime(mismatch.phase_starts_at * 1000)})`
		: "";

const itemLabel = (mismatch: ItemMismatch): string => {
	const feature = mismatch.feature_id;
	switch (mismatch.price_type) {
		case "usage":
			return feature
				? `the usage-based ${feature} price`
				: "a usage-based price";
		case "prepaid":
			return feature ? `the prepaid ${feature} price` : "a prepaid price";
		case "allocated":
			return feature ? `the allocated ${feature} price` : "an allocated price";
		case "fixed":
			return feature ? `the fixed ${feature} price` : "a fixed price";
		default:
			return feature ? `the ${feature} item` : "an unrecognized item";
	}
};

const describeItemMismatch = (mismatch: ItemMismatch): string => {
	const label = itemLabel(mismatch);
	const expectedPrice = mismatch.expected_price_id
		? ` (${mismatch.expected_price_id})`
		: "";
	const actualPrice = mismatch.actual_price_id
		? ` (${mismatch.actual_price_id})`
		: "";
	switch (mismatch.reason) {
		case "missing":
			// Quantity 0 = metered item (no quantity on Stripe) — omit the noise.
			return `Missing Stripe item for ${label}${expectedPrice}${
				mismatch.expected_quantity
					? ` (expected quantity ${mismatch.expected_quantity})`
					: ""
			}`;
		case "unexpected":
			return `Stripe price unmatched — ${planPriceLabel(mismatch) ?? "item"} not in Autumn${actualPrice}`;
		case "quantity_mismatch": {
			if (mismatch.price_type === "fixed") {
				return `Base price unmatched — ${planPriceLabel(mismatch) ?? "base price"}: expected ${mismatch.expected_quantity}, Stripe has ${mismatch.actual_quantity}`;
			}
			return `Quantity for ${label} differs — expected ${mismatch.expected_quantity}, Stripe has ${mismatch.actual_quantity}`;
		}
		case "price_mismatch":
			return `Price for ${label} differs from Autumn's record`;
	}
};

const describeScheduleMismatch = (mismatch: ScheduleMismatch): string => {
	switch (mismatch.reason) {
		case "missing_schedule":
			return "Expected a subscription schedule on Stripe but found none";
		case "unexpected_schedule": {
			const phaseStarts = mismatch.actual_phase_starts_at
				?.map((startSeconds) => formatUnixToDateTime(startSeconds * 1000))
				.join(", ");
			return phaseStarts
				? `Stripe schedule phases not in Autumn — starting ${phaseStarts}`
				: "Stripe has a subscription schedule Autumn doesn't expect";
		}
		case "phase_count_mismatch":
			return `Schedule phase count differs — expected ${mismatch.expected_phase_count}, Stripe has ${mismatch.actual_phase_count}`;
		case "phase_start_mismatch":
			return "A schedule phase starts at a different time than Autumn expects";
		case "billing_cycle_anchor_mismatch":
			return "Schedule billing cycle anchor differs from Autumn's record";
	}
};

const describe = (mismatch: SubscriptionMismatch): string => {
	switch (mismatch.type) {
		case "stripe_sub_not_in_autumn":
			return "Active Stripe subscription has no linked Autumn products";
		case "stale_subscription_link":
			return "Autumn products link to a Stripe subscription that is not in the customer's active set";
		case "expected_state_error":
			return `Could not compute Autumn's expected Stripe state — ${mismatch.error}`;
		case "shared_stripe_customer":
			return `Stripe customer ${mismatch.stripe_customer_id} is also linked to Autumn customer(s): ${mismatch.other_customer_ids.join(", ")}`;
		case "base_price_mismatch": {
			const { reason, expected_amount, actual_amount } = mismatch;
			const label = planPriceLabel(mismatch);
			if (reason === "missing") {
				const quantityClause =
					mismatch.expected_quantity != null
						? `: expected ${mismatch.expected_quantity}, Stripe has 0`
						: "";
				return `Base price unmatched — ${label ?? "base price"}${quantityClause}${mismatch.expected_price_id ? ` (${mismatch.expected_price_id})` : ""}`;
			}
			if (reason === "unexpected") {
				return `Stripe price unmatched — ${label ?? "item"} not in Autumn${mismatch.actual_price_id ? ` (${mismatch.actual_price_id})` : ""}`;
			}
			return `Base price differs — expected ${expected_amount}, Stripe has ${actual_amount}`;
		}
		case "item_mismatch":
			return describeItemMismatch(mismatch);
		case "prepaid_quantity_mismatch":
			return `Prepaid ${mismatch.feature_id} quantity differs — expected ${mismatch.expected_quantity}, Stripe has ${mismatch.actual_quantity}`;
		case "prepaid_price_mismatch":
			return `Prepaid ${mismatch.feature_id} unit price differs — expected ${mismatch.expected_unit_amount}, Stripe has ${mismatch.actual_unit_amount}`;
		case "schedule_mismatch":
			return describeScheduleMismatch(mismatch);
		case "cancel_state_mismatch": {
			if (mismatch.expected_canceling && mismatch.actual_canceling) {
				return "Subscription cancels at a different time than Autumn expects";
			}
			return mismatch.actual_canceling
				? "Stripe shows this subscription canceling but Autumn doesn't expect it"
				: "Autumn expects this subscription to be canceling but Stripe shows it active";
		}
		case "reward_mismatch": {
			const parts = [
				mismatch.missing_reward_ids.length > 0 &&
					`missing coupons: ${mismatch.missing_reward_ids.join(", ")}`,
				mismatch.unexpected_reward_ids.length > 0 &&
					`unexpected coupons: ${mismatch.unexpected_reward_ids.join(", ")}`,
			].filter(Boolean);
			return `Rewards differ — ${parts.join("; ")}`;
		}
	}
};

/** One human-readable line per mismatch — the canonical display text for the
 * dashboard, sheets, and logs. */
export const verifyMismatchToMessage = (
	mismatch: SubscriptionMismatch,
): string => `${describe(mismatch)}${phaseSuffix(mismatch)}`;
