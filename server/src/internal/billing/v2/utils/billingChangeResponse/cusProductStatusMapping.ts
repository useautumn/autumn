import { CusProductStatus } from "@autumn/shared";

export type PublicLifecycleStatus = "active" | "scheduled" | "expired";

/**
 * Maps internal `CusProductStatus` to the public lifecycle status surfaced on
 * webhook payloads (and the public API). Trialing / PastDue / Paused are
 * collapsed; the underlying state is conveyed via `past_due` / `trial_ends_at`
 * fields rather than the status enum.
 */
export const cusProductStatusToPublicStatus = (
	status: CusProductStatus,
): PublicLifecycleStatus => {
	switch (status) {
		case CusProductStatus.Scheduled:
			return "scheduled";
		case CusProductStatus.Expired:
		case CusProductStatus.Paused:
			return "expired";
		default:
			return "active";
	}
};
