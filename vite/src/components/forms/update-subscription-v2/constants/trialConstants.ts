import { FreeTrialDuration } from "@autumn/shared";

export const TRIAL_DURATION_OPTIONS = [
	{ label: "Days", value: FreeTrialDuration.Day },
	{ label: "Months", value: FreeTrialDuration.Month },
	{ label: "Years", value: FreeTrialDuration.Year },
] as const;

const DURATION_LABELS: Record<
	FreeTrialDuration,
	{ singular: string; plural: string }
> = {
	[FreeTrialDuration.Day]: { singular: "day", plural: "days" },
	[FreeTrialDuration.Month]: { singular: "month", plural: "months" },
	[FreeTrialDuration.Year]: { singular: "year", plural: "years" },
};

export function formatTrialDuration({
	length,
	duration,
}: {
	length: number;
	duration: FreeTrialDuration;
}): string {
	const labels = DURATION_LABELS[duration];
	return `${length} ${length === 1 ? labels.singular : labels.plural}`;
}
