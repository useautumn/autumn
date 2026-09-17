export const getTestClockTimeError = ({
	frozenTime,
	target,
}: {
	frozenTime: number;
	target: number | null;
}): string | undefined => {
	if (target == null || !Number.isFinite(target)) {
		return "Choose a date and time.";
	}
	if (Math.floor(target / 1000) <= Math.floor(frozenTime / 1000)) {
		return "Choose a time after the current clock time.";
	}
	return undefined;
};
