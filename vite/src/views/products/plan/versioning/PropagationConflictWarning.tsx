import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export function PropagationConflictWarning({
	hasConflicts,
}: {
	hasConflicts: boolean;
}) {
	if (!hasConflicts) return null;

	return (
		<InfoBox variant="warning">
			This update conflicts with certain plans. We recommend handling them
			separately.
		</InfoBox>
	);
}
