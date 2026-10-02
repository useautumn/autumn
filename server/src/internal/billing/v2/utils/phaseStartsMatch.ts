import { ms } from "@autumn/shared";

/** Stripe anchors a phase when it creates it, so its start drifts seconds to minutes from the requested one. */
const PHASE_START_TOLERANCE_MS = ms.hours(1);

export const phaseStartsMatch = ({
	startsAt,
	otherStartsAt,
}: {
	startsAt: number;
	otherStartsAt: number;
}) => Math.abs(startsAt - otherStartsAt) <= PHASE_START_TOLERANCE_MS;
