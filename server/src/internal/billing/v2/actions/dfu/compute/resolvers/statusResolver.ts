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
