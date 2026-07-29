export type SettingChange = { key: string; label: string; detail: string };

const SETTING_LABELS: Record<string, string> = {
	name: "Name",
	description: "Description",
	group: "Group",
	add_on: "Add-on",
	auto_enable: "Default plan",
	free_trial: "Free trial",
	config: "Config",
	billing_controls: "Billing controls",
};

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
