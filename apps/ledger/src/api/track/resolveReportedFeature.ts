import type { Feature } from "@autumn/shared";

// Rows 105-106: the reported feature comes from the command's relevant set —
// unlimited first, then the first with a real deduction. Until credit systems
// that set is the tracked feature alone, so one entry decides it.
export const resolveReportedFeature = ({
	features,
}: {
	features: Feature[];
}): Feature | null => (features.length === 1 ? (features[0] ?? null) : null);
