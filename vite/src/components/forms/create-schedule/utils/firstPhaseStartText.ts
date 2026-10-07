import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";
import { formatOptionDate } from "@/components/forms/shared/billing-option-sections/utils/billingOptionSummaries";
import { firstPhaseStartsLater } from "./schedulePhaseTiming";

/** "Starts now", "Starts Oct 20", "Backdated to Oct 1", or "Started Oct 1" for a running schedule. */
export function firstPhaseStartText({
	phases,
	nowMs,
	isExistingSchedule,
}: {
	phases: CustomerStatePhase[];
	nowMs: number;
	isExistingSchedule: boolean;
}) {
	const startsAt = phases[0]?.startsAt ?? null;
	if (startsAt === null) return "Starts now";
	if (firstPhaseStartsLater({ phases, nowMs })) {
		return `Starts ${formatOptionDate(startsAt)}`;
	}
	if (startsAt >= nowMs) return "Starts now";
	const verb = isExistingSchedule ? "Started" : "Backdated to";
	return `${verb} ${formatOptionDate(startsAt)}`;
}
