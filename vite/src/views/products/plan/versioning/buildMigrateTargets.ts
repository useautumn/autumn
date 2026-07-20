import type {
	PlanUpdatePreview,
	PlanUpdatePreviewItemChange,
	PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";
import {
	previousAttributesToSettingChanges,
	type SettingChange,
} from "./PlanSettingsChanges";

export type MigrateTargetRow = {
	version: number;
	isCurrent: boolean;
	isNew: boolean;
	itemChanges: PlanUpdatePreviewItemChange[];
	hasPriceChange: boolean;
	settingChanges: SettingChange[];
	customerCount: number;
	conflicts: PlanUpdatePreviewVariantConflict[];
};

export type MigrateTarget = {
	id: string;
	name: string;
	isBase: boolean;
	rows: MigrateTargetRow[];
};

export const getLicenseParentTargetId = ({
	plan_id,
	version,
}: Pick<PlanUpdatePreview["license_parents"][number], "plan_id" | "version">) =>
	`${plan_id}@${version}`;

export const buildSelectedLicenseParentUpdates = ({
	parents,
	selectedIds,
}: {
	parents: PlanUpdatePreview["license_parents"];
	selectedIds: string[];
}) => {
	const selectedIdSet = new Set(selectedIds);
	const updates: Array<{ plan_id: string; version: number }> = [];
	for (const parent of parents) {
		if (!selectedIdSet.has(getLicenseParentTargetId(parent))) continue;
		updates.push({ plan_id: parent.plan_id, version: parent.version });
	}
	return updates;
};

export function buildMigrateTargets({
	preview,
	selectedVariantIds,
	selectedLicenseParentIds,
	versionChoice,
	currentVersion,
	baseName,
}: {
	preview: PlanUpdatePreview;
	selectedVariantIds: string[];
	selectedLicenseParentIds: string[];
	versionChoice: "new" | "update" | "all";
	currentVersion: number;
	baseName: string;
}): MigrateTarget[] {
	const includeHistorical = versionChoice === "all";
	const isNewVersion = versionChoice === "new";
	const baseCreatesNewVersion = isNewVersion && preview.has_customers;

	const baseRows: MigrateTargetRow[] = [
		{
			version: baseCreatesNewVersion ? currentVersion + 1 : currentVersion,
			isCurrent: !baseCreatesNewVersion,
			isNew: baseCreatesNewVersion,
			itemChanges: preview.item_changes ?? [],
			hasPriceChange: preview.price_change !== undefined,
			settingChanges: previousAttributesToSettingChanges(
				preview.previous_attributes,
			),
			customerCount: preview.customer_count,
			conflicts: [],
		},
		...(includeHistorical
			? (preview.other_versions ?? []).map((version) => ({
					version: version.version,
					isCurrent: false,
					isNew: false,
					itemChanges: version.item_changes ?? [],
					hasPriceChange: version.price_change !== undefined,
					settingChanges: previousAttributesToSettingChanges(
						version.previous_attributes,
					),
					customerCount: version.customer_count,
					conflicts: version.conflicts,
				}))
			: []),
	];

	const targets: MigrateTarget[] = [
		{ id: preview.plan_id, name: baseName, isBase: true, rows: baseRows },
	];

	for (const variantId of selectedVariantIds) {
		const entries = preview.variants
			.filter((variant) => variant.plan_id === variantId)
			.sort((a, b) => b.version - a.version);
		if (entries.length === 0) continue;

		const latestVersion = entries[0].version;
		const visible = includeHistorical
			? entries
			: entries.filter((entry) => entry.version === latestVersion);

		targets.push({
			id: variantId,
			name: entries[0].name,
			isBase: false,
			rows: visible.map((entry) => {
				const isLatest = entry.version === latestVersion;
				const createsNewVersion =
					isNewVersion && isLatest && entry.has_customers;
				return {
					version: createsNewVersion ? entry.version + 1 : entry.version,
					isCurrent: isLatest && !createsNewVersion,
					isNew: createsNewVersion,
					itemChanges: entry.item_changes ?? [],
					hasPriceChange: entry.price_change !== undefined,
					settingChanges: previousAttributesToSettingChanges(
						entry.previous_attributes,
					),
					customerCount: entry.customer_count,
					conflicts: entry.conflicts,
				};
			}),
		});
	}

	const selectedLicenseParentIdSet = new Set(selectedLicenseParentIds);
	for (const entry of preview.license_parents) {
		const targetId = getLicenseParentTargetId(entry);
		if (!selectedLicenseParentIdSet.has(targetId)) continue;
		const planChanges = entry.license_changes[0]?.plan_changes;
		const createsNewVersion = isNewVersion && entry.has_customers;
		targets.push({
			id: `license-parent:${targetId}`,
			name: entry.name,
			isBase: false,
			rows: [
				{
					version: createsNewVersion ? entry.version + 1 : entry.version,
					isCurrent: !createsNewVersion,
					isNew: createsNewVersion,
					itemChanges: planChanges?.item_changes ?? [],
					hasPriceChange: planChanges?.price_change !== undefined,
					settingChanges: [],
					customerCount: entry.customer_count,
					conflicts: entry.conflicts,
				},
			],
		});
	}

	return targets;
}
