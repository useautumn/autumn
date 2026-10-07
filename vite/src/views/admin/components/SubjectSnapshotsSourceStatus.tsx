import { Separator } from "@autumn/ui";
import { ConfigHealthChip } from "./ConfigHealthChip";
import {
	formatWrittenAfter,
	type SubjectSnapshotsConfigResponse,
} from "./subjectSnapshotsConfig";

export function SubjectSnapshotsSourceStatus({
	config,
}: {
	config: SubjectSnapshotsConfigResponse;
}) {
	return (
		<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
			<Separator />
			<div className="flex flex-wrap items-center justify-between gap-2">
				<ConfigHealthChip healthy={config.configHealthy}>
					{config.configHealthy ? "Config healthy" : "Config unreadable"}
				</ConfigHealthChip>
				<span className="tabular-nums">
					Only trusts rows written after:{" "}
					<span className="text-foreground">
						{formatWrittenAfter(config.writtenAfter)}
					</span>
				</span>
			</div>
			<p className="text-pretty">
				{config.error ??
					"Workers pick up a save within their poll interval, no deploy. Leaving off stamps the time automatically."}
			</p>
		</div>
	);
}
