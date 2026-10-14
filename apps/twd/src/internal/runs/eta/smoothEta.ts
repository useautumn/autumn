const MAX_STEP = 0.2;
const MIN_STEP_MS = 5_000;

export const smoothFinishAt = ({
	shownFinishAt,
	etaMs,
	now,
}: {
	shownFinishAt: number | null;
	etaMs: number;
	now: number;
}) => {
	if (shownFinishAt === null) return now + etaMs;
	const shown = Math.max(0, shownFinishAt - now);
	const step = Math.max(shown * MAX_STEP, MIN_STEP_MS);
	return now + Math.min(shown + step, Math.max(shown - step, etaMs));
};

export const roundEta = (ms: number) => {
	const unit = ms < 120_000 ? 5_000 : ms < 600_000 ? 15_000 : 60_000;
	return Math.max(unit, Math.round(ms / unit) * unit);
};
