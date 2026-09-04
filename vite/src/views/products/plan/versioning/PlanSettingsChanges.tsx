import { PLAN_PREVIOUS_ATTRIBUTE_LABELS } from "@autumn/shared";
export type SettingChange = { key: string; label: string; detail: string };

const SETTING_LABELS = PLAN_PREVIOUS_ATTRIBUTE_LABELS;

// Derived entirely from the backend preview's previous_attributes — the
// frontend never diffs plan objects itself. A null previous value means the
// field was added.
export function previousAttributesToSettingChanges(
	previousAttributes: Record<string, unknown> | null | undefined,
): SettingChange[] {
	if (!previousAttributes) return [];
	return Object.keys(previousAttributes)
		.filter((key) => key in SETTING_LABELS)
		.map((key) => ({
			key,
			label: SETTING_LABELS[key],
			detail: previousAttributes[key] == null ? "added" : "updated",
		}));
}

export function PlanSettingsChanges({ changes }: { changes: SettingChange[] }) {
	if (changes.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 text-sm">
			{changes.map((change) => (
				<div className="flex items-center gap-1.5" key={change.key}>
					<span className="font-medium text-foreground">{change.label}</span>
					<span className="text-muted-foreground">{change.detail}</span>
				</div>
			))}
		</div>
	);
}
