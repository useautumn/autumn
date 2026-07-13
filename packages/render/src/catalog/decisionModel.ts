import type {
	CatalogPlanPreview,
	PlanUpdatePreviewOtherVersion,
	PlanUpdatePreviewVariant,
	PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";

export type CatalogVersioningChoice =
	| "create_version"
	| "update_all_versions"
	| "update_current";

export type CatalogVersioningOption = {
	description: string;
	label: string;
	value: CatalogVersioningChoice;
};

export type CatalogDecisionVariant = {
	conflictMessages: string[];
	/** Conflict-free variants are propagated by default. */
	defaultSelected: boolean;
	hasCustomers: boolean;
	name: string;
	planId: string;
	version: number;
};

/** Surface-neutral model of the versioning / variant-propagation / migration
 * decisions a previewed plan update needs. One source of truth for the option
 * wording shown on the dashboard, in chat surfaces, and in the CLI. */
export type CatalogDecisionModel = {
	defaultVersioning: CatalogVersioningChoice;
	/** Metadata-only edits (name, description) skip the versioning choice. */
	metadataOnly: boolean;
	migration: { available: boolean; description: string; label: string };
	needsDecision: boolean;
	planId: string;
	planName: string;
	variants: CatalogDecisionVariant[];
	versioningOptions: CatalogVersioningOption[];
};

const isVersionableChange = (plan: CatalogPlanPreview): boolean =>
	Boolean(plan.customize) ||
	(!!plan.previous_attributes &&
		"billing_controls" in plan.previous_attributes);

const hasHistoricalVersions = (plan: CatalogPlanPreview): boolean =>
	(plan.other_versions?.length ?? 0) > 0;

const hasMigratableDiff = (plan: CatalogPlanPreview): boolean =>
	(plan.item_changes?.length ?? 0) > 0 || plan.price_change !== undefined;

const hasCustomersAnywhere = (plan: CatalogPlanPreview): boolean =>
	plan.has_customers ||
	(plan.other_versions ?? []).some(
		(version: PlanUpdatePreviewOtherVersion) => version.has_customers,
	) ||
	(plan.variants ?? []).some(
		(variant: PlanUpdatePreviewVariant) => variant.has_customers,
	);

/** Whether `previewUpdateCatalog` returned enough for this plan (customers,
 * variants, or historical versions) that the versioning/variant/migration
 * choices matter, mirroring the dashboard's `PlanChangeDialog` gating. */
export const planNeedsDecision = (plan: CatalogPlanPreview): boolean =>
	isVersionableChange(plan) &&
	(plan.versionable ||
		hasHistoricalVersions(plan) ||
		(plan.variants?.length ?? 0) > 0);

const CONFLICT_REASON_LABELS: Record<
	PlanUpdatePreviewVariantConflict["reason"],
	string
> = {
	base_price_divergence: "has a customized base price",
	different_interval: "holds this feature at a different interval",
	value_divergence: "has a customized value",
};

const conflictMessage = (
	conflict: PlanUpdatePreviewVariantConflict,
): string => {
	const label = CONFLICT_REASON_LABELS[conflict.reason];
	return conflict.feature_name ? `${conflict.feature_name} ${label}` : label;
};

const VERSIONING_OPTIONS: Record<
	CatalogVersioningChoice,
	CatalogVersioningOption
> = {
	create_version: {
		description:
			"Existing customers stay grandfathered on their current version.",
		label: "Create new version",
		value: "create_version",
	},
	update_all_versions: {
		description:
			"Applies this change to every version of this plan and its variants.",
		label: "Update all versions",
		value: "update_all_versions",
	},
	update_current: {
		description:
			"Updates the live version in place. You can migrate current customers after.",
		label: "Update current version",
		value: "update_current",
	},
};

export const buildCatalogDecisionModel = ({
	plan,
}: {
	plan: CatalogPlanPreview;
}): CatalogDecisionModel => {
	const metadataOnly = !isVersionableChange(plan);
	const variants = metadataOnly ? [] : (plan.variants ?? []);
	const versioningOptions = metadataOnly
		? []
		: [
				VERSIONING_OPTIONS.create_version,
				VERSIONING_OPTIONS.update_current,
				...(hasHistoricalVersions(plan)
					? [VERSIONING_OPTIONS.update_all_versions]
					: []),
			];

	return {
		defaultVersioning: metadataOnly ? "update_all_versions" : "create_version",
		metadataOnly,
		migration: {
			// Only offered when the update lands in place on a plan with customers.
			available: hasMigratableDiff(plan) && hasCustomersAnywhere(plan),
			description:
				"Moves existing customers onto the new plan shape. Review and run it separately after.",
			label: "Create migration draft",
		},
		needsDecision: planNeedsDecision(plan),
		planId: plan.plan_id,
		planName: plan.plan?.name ?? plan.plan_id,
		variants: variants.map((variant: PlanUpdatePreviewVariant) => ({
			conflictMessages: (variant.conflicts ?? []).map(conflictMessage),
			defaultSelected: (variant.conflicts ?? []).length === 0,
			hasCustomers: variant.has_customers,
			name: variant.name,
			planId: variant.plan_id,
			version: variant.version,
		})),
		versioningOptions,
	};
};
