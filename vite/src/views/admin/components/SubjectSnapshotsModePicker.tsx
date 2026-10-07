import type { SubjectSnapshotMode } from "@autumn/edge-config/subjectSnapshots";
import { AreaRadioGroupItem, Label, RadioGroup } from "@autumn/ui";
import { SUBJECT_SNAPSHOT_MODES } from "./subjectSnapshotsConfig";

export function SubjectSnapshotsModePicker({
	value,
	onChange,
}: {
	value: SubjectSnapshotMode;
	onChange: (mode: SubjectSnapshotMode) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label>Mode</Label>
			<RadioGroup
				value={value}
				onValueChange={(mode) => onChange(mode as SubjectSnapshotMode)}
				className="grid gap-2 sm:grid-cols-2"
			>
				{SUBJECT_SNAPSHOT_MODES.map((mode) => (
					<AreaRadioGroupItem
						key={mode.value}
						value={mode.value}
						label={mode.label}
						description={mode.description}
						className="rounded-lg border border-border p-3 transition-colors hover:border-zinc-300 has-data-checked:border-primary has-data-checked:bg-muted/40 dark:hover:border-zinc-700"
					/>
				))}
			</RadioGroup>
		</div>
	);
}
