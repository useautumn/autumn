import { CusProductStatus, type FlashPlan } from "@autumn/shared";
import type { StripeHydration } from "../../setup/hydrate/hydrateStripeBillable";

export type ResolvedFlashStatus = {
	status: CusProductStatus;
	canceled: boolean;
	canceledAt: number | null;
	endedAt: number | null;
	reportStatus: string;
};

type PayloadStatus = NonNullable<FlashPlan["status"]>;

/** Fall back to the hydrated Stripe status when the caller omitted `plan.status`. */
const autumnStatusToPayloadStatus = (
	status?: CusProductStatus,
): PayloadStatus | undefined => {
	switch (status) {
		case CusProductStatus.PastDue:
			return "past_due";
		case CusProductStatus.Expired:
			return "expired";
		case CusProductStatus.Active:
			return "active";
		default:
			return undefined;
	}
};

/**
 * Derives status + canceled_at + ended_at together so an ended plan can never
 * be written as `active` with a past `ended_at` — access is gated on status
 * alone, so that shape would leak feature access. Payload status wins; Stripe
 * hydration only fills gaps (cancel/end timestamps and an omitted status).
 */
export const resolveFlashStatus = ({
	plan,
	now,
	hydration,
}: {
	plan: FlashPlan;
	now: number;
	hydration?: StripeHydration;
}): ResolvedFlashStatus => {
	const effectiveStatus =
		plan.status ?? autumnStatusToPayloadStatus(hydration?.status) ?? "active";
	const reportStatus = effectiveStatus;

	const hydratedFutureEnd =
		hydration?.endedAt !== undefined && hydration.endedAt > now
			? hydration.endedAt
			: undefined;
	const canceledAt = hydration?.canceledAt ?? now;

	switch (effectiveStatus) {
		case "past_due":
			return {
				status: CusProductStatus.PastDue,
				canceled: false,
				canceledAt: null,
				endedAt: null,
				reportStatus,
			};
		case "expired":
			return {
				status: CusProductStatus.Expired,
				canceled: true,
				canceledAt: now,
				endedAt: now,
				reportStatus,
			};
		case "canceled":
			// A future period-end governs access; without one, fail safe to Expired
			// so a canceled plan can't leak access via status:active.
			if (hydratedFutureEnd !== undefined) {
				return {
					status: CusProductStatus.Active,
					canceled: true,
					canceledAt,
					endedAt: hydratedFutureEnd,
					reportStatus,
				};
			}
			return {
				status: CusProductStatus.Expired,
				canceled: true,
				canceledAt: now,
				endedAt: now,
				reportStatus,
			};
		default: {
			// Active / trialing: honor a hydrated future cancellation as canceled.
			if (hydratedFutureEnd !== undefined) {
				return {
					status: CusProductStatus.Active,
					canceled: true,
					canceledAt,
					endedAt: hydratedFutureEnd,
					reportStatus,
				};
			}
			return {
				status: CusProductStatus.Active,
				canceled: false,
				canceledAt: null,
				endedAt: null,
				reportStatus,
			};
		}
	}
};
