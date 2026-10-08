import { Alert, AlertDescription, AlertTitle } from "@autumn/ui";
import { ArrowRight, TriangleAlert } from "lucide-react";
import type { SubjectSnapshotsChange } from "./subjectSnapshotsConfig";

export function SubjectSnapshotsReview({
	changes,
	servesSnapshots,
	stampsWrittenAfter,
}: {
	changes: SubjectSnapshotsChange[];
	servesSnapshots: boolean;
	stampsWrittenAfter: boolean;
}) {
	return (
		<div className="flex flex-col gap-4">
			{servesSnapshots && (
				<Alert variant="warning">
					<TriangleAlert />
					<AlertTitle>Cold loads will serve from the snapshot table</AlertTitle>
					<AlertDescription className="text-pretty">
						Customers see balances built from subject_snapshots instead of the
						balance rows. Make sure verify has run clean first.
					</AlertDescription>
				</Alert>
			)}

			{changes.length === 0 ? (
				<p className="text-sm text-tertiary-foreground">Nothing changes.</p>
			) : (
				<dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
					{changes.map((change) => (
						<div key={change.field} className="flex flex-col gap-1 px-3 py-2.5">
							<dt className="text-xs text-tertiary-foreground">
								{change.label}
							</dt>
							<dd className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
								<span className="text-tertiary-foreground line-through">
									{change.from}
								</span>
								<ArrowRight className="size-3.5 shrink-0 text-tertiary-foreground" />
								<span className="font-medium text-foreground">{change.to}</span>
							</dd>
						</div>
					))}
				</dl>
			)}

			{stampsWrittenAfter && (
				<p className="text-pretty text-xs text-tertiary-foreground">
					Leaving off stamps the time automatically, so rows left from an
					earlier run are never verified or served. The server sets the exact
					time when it saves.
				</p>
			)}
		</div>
	);
}
