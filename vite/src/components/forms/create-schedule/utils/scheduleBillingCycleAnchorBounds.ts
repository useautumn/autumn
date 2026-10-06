import { firstPhaseStartsLater } from "./schedulePhaseTiming";

/** set_plans rejects a custom anchor on a later first phase, after ends_at, or after the next phase of a live subscription. */
export const scheduleBillingCycleAnchorBounds = ({
	phases,
	endDate,
	nowMs,
	hasActiveSubscription,
}: {
	phases: { startsAt: number | null }[];
	endDate: number | null;
	nowMs: number;
	hasActiveSubscription: boolean;
}): {
	allowCustomAnchor: boolean;
	minUnixDate: number;
	maxUnixDate?: number;
} => {
	const nextPhaseStartsAt = hasActiveSubscription
		? (phases[1]?.startsAt ?? null)
		: null;
	const caps = [endDate, nextPhaseStartsAt].filter(
		(cap): cap is number => cap !== null,
	);
	return {
		allowCustomAnchor: !firstPhaseStartsLater({ phases, nowMs }),
		minUnixDate: nowMs,
		...(caps.length > 0 && { maxUnixDate: Math.min(...caps) }),
	};
};
