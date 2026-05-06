import type { AttachBillingContext, AttachParamsV1 } from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";

const resolveResetCycleAnchor = ({
	billingStartsAt,
	billingAnchorStartsAt,
	resetCycleAnchorMs,
}: {
	billingStartsAt?: number;
	billingAnchorStartsAt?: number;
	resetCycleAnchorMs: number | "now";
}): number | "now" => {
	if (billingStartsAt !== undefined) return billingStartsAt;
	if (resetCycleAnchorMs !== "now") return resetCycleAnchorMs;
	return billingAnchorStartsAt ?? resetCycleAnchorMs;
};

const resolveCustomerProductStatus = ({
	billingStartsAt,
	isScheduled,
}: {
	billingStartsAt?: number;
	isScheduled: boolean;
}): CusProductStatus | undefined => {
	if (billingStartsAt !== undefined) return CusProductStatus.Active;
	if (isScheduled) return CusProductStatus.Scheduled;
	return undefined;
};

export const getAttachStartTiming = ({
	planTiming,
	endOfCycleMs,
	params,
	resetCycleAnchorMs,
	currentEpochMs,
	billingStartsAt,
}: {
	planTiming: AttachBillingContext["planTiming"];
	endOfCycleMs?: number;
	params: AttachParamsV1;
	resetCycleAnchorMs: number | "now";
	currentEpochMs: number;
	billingStartsAt?: number;
}): {
	accessStartsAt?: number;
	billingAnchorStartsAt?: number;
	resetCycleAnchor: number | "now";
	status?: CusProductStatus;
} => {
	const isScheduled = planTiming === "end_of_cycle";
	const requestedStartsAt =
		params.starts_at ?? (isScheduled ? endOfCycleMs : undefined);
	const billingAnchorStartsAt = billingStartsAt ?? requestedStartsAt;
	const accessStartsAt =
		billingStartsAt !== undefined ? currentEpochMs : requestedStartsAt;
	const resetCycleAnchor = resolveResetCycleAnchor({
		billingStartsAt,
		billingAnchorStartsAt,
		resetCycleAnchorMs,
	});
	const status = resolveCustomerProductStatus({
		billingStartsAt,
		isScheduled,
	});

	return {
		accessStartsAt,
		billingAnchorStartsAt,
		resetCycleAnchor,
		status,
	};
};
