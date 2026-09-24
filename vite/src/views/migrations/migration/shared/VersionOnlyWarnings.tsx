import type { Operations } from "@autumn/shared";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import {
	versionOnlyWarningVersions,
	versionWarningText,
} from "./operationUtils";

export function VersionOnlyWarnings({
	operations,
}: {
	operations: Operations;
}) {
	return (
		<>
			{versionOnlyWarningVersions(operations).map((version) => (
				<InfoBox key={version} variant="warning">
					{versionWarningText(version)}
				</InfoBox>
			))}
		</>
	);
}
