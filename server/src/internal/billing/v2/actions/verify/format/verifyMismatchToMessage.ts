import type {
	ItemMismatch,
	ScheduleMismatch,
	SubscriptionMismatch,
} from "@autumn/shared";
import { formatUnixToDateTime } from "@/utils/genUtils";

const phaseSuffix = (mismatch: SubscriptionMismatch): string =>
	"phase_starts_at" in mismatch && mismatch.phase_starts_at !== undefined
		? ` (in future phase starting ${formatUnixToDateTime(mismatch.phase_starts_at * 1000)})`
		: "";

const itemLabel = (mismatch: ItemMismatch): string => {
	const feature = mismatch.feature_id ?? "an item";
	switch (mismatch.price_type) {
		case "usage":
			return `the usage-based ${feature} price`;
		case "prepaid":
			return `the prepaid ${feature} price`;
		case "allocated":
			return `the allocated ${feature} price`;
		case "fixed":
			return `the fixed ${feature} price`;
		default:
			return `the ${feature} item`;
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
			return `Unexpected Stripe item for ${label}${actualPrice}`;
		case "quantity_mismatch":
			return `Quantity for ${label} differs — expected ${mismatch.expected_quantity}, Stripe has ${mismatch.actual_quantity}`;
		case "price_mismatch":
			return `Price for ${label} differs from Autumn's record`;
	}
};

const describeScheduleMismatch = (mismatch: ScheduleMismatch): string => {
	switch (mismatch.reason) {
		case "missing_schedule":
			return "Expected a subscription schedule on Stripe but found none";
		case "unexpected_schedule":
			return "Stripe has a subscription schedule Autumn doesn't expect";
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
		case "subscription_not_linked":
			return "Active Stripe subscription has no linked Autumn products";
		case "stale_subscription_link":
			return "Autumn products link to a Stripe subscription that is not in the customer's active set";
		case "expected_state_error":
			return `Could not compute Autumn's expected Stripe state — ${mismatch.error}`;
		case "base_price_mismatch": {
			const { reason, expected_amount, actual_amount } = mismatch;
			if (reason === "missing") {
				return `Base price missing on Stripe${mismatch.expected_price_id ? ` (${mismatch.expected_price_id})` : ""}${expected_amount ? ` (expected ${expected_amount})` : ""}`;
			}
			if (reason === "unexpected") {
				return `Unexpected base price on Stripe${mismatch.actual_price_id ? ` (${mismatch.actual_price_id})` : ""}${actual_amount ? ` (${actual_amount})` : ""}`;
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
		case "cancel_state_mismatch":
			return mismatch.actual_canceling
				? "Stripe shows this subscription canceling but Autumn doesn't expect it"
				: "Autumn expects this subscription to be canceling but Stripe shows it active";
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
