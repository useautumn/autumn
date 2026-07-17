import type {
	CatalogPlanPreview,
	PlanUpdatePreviewOtherVersion,
	PlanUpdatePreviewVariant,
} from "@autumn/shared";
import { AreaRadioGroupItem, Button, RadioGroup, Switch } from "@autumn/ui";
import { useMemo, useState } from "react";
import { PlanDiffBody } from "@/components/v2/PlanDiffBody";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { PropagateVariantsStep } from "@/views/products/plan/versioning/PropagateVariantsStep";
import type { VariantConflictInfo } from "@/views/products/plan/versioning/variantConflicts";
import type { LeafCatalogDecision } from "../chatTypes";

const isVersionableChange = (plan: CatalogPlanPreview) =>
	Boolean(plan.customize) ||
	(!!plan.previous_attributes &&
		"billing_controls" in plan.previous_attributes);

const hasHistoricalVersions = (plan: CatalogPlanPreview) =>
	(plan.other_versions?.length ?? 0) > 0;

const hasMigratableDiff = (plan: CatalogPlanPreview) =>
	(plan.item_changes?.length ?? 0) > 0 || plan.price_change !== undefined;

const hasCustomersAnywhere = (plan: CatalogPlanPreview) =>
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

/** Versioning/variant-propagation/migration decisions for a previewed plan
 * update, sourced entirely from the `previewUpdateCatalog` result — same
 * fields the dashboard's `PlanChangeDialog` reads. "Continue" doesn't apply
 * anything itself; it hands the decision back to the agent as the next
 * turn's structured context. */
export function CatalogDecisionCard({
	onSubmit,
	plan,
	status,
}: {
	onSubmit: (decision: LeafCatalogDecision) => void;
	plan: CatalogPlanPreview;
	status: "pending" | "submitted";
}) {
	const { features: orgFeatures } = useFeaturesQuery();
	const metadataOnly = !isVersionableChange(plan);
	const showAllVersionsOption = hasHistoricalVersions(plan);
	const variants = plan.variants ?? [];
	const showVariants = !metadataOnly && variants.length > 0;

	const variantConflicts = useMemo<VariantConflictInfo[]>(
		() =>
			variants.map((variant: PlanUpdatePreviewVariant) => ({
				conflicts: variant.conflicts ?? [],
				itemChanges: variant.item_changes ?? [],
				variant: { id: variant.plan_id, name: variant.name },
			})),
		[variants],
	);

	const [versioning, setVersioning] = useState<
		LeafCatalogDecision["versioning"]
	>(metadataOnly ? "update_all_versions" : "create_version");
	const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>(() =>
		variantConflicts
			.filter((entry) => entry.conflicts.length === 0)
			.map((entry) => entry.variant.id),
	);
	const [migrationDraft, setMigrationDraft] = useState(false);

	const migrateAvailable =
		versioning !== "create_version" &&
		hasMigratableDiff(plan) &&
		hasCustomersAnywhere(plan);

	const handleSubmit = () => {
		onSubmit({
			migrationDraft: migrateAvailable && migrationDraft,
			planId: plan.plan_id,
			propagateVariantIds: showVariants ? selectedVariantIds : [],
			versioning,
		});
	};

	return (
		<div className="flex w-[560px] max-w-full flex-col gap-3 rounded-md border border-border bg-secondary/40 p-3 text-sm">
			<span className="font-medium text-foreground">
				{plan.plan?.name ?? plan.plan_id} needs a few decisions
			</span>

			<PlanDiffBody features={orgFeatures} plan={plan} />

			{!metadataOnly && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						Versioning
					</span>
					<RadioGroup
						onValueChange={(value) =>
							setVersioning(value as LeafCatalogDecision["versioning"])
						}
						value={versioning}
					>
						<AreaRadioGroupItem
							description="Existing customers stay grandfathered on their current version."
							label="Create new version"
							value="create_version"
						/>
						<AreaRadioGroupItem
							description="Updates the live version in place. You can migrate current customers after."
							label="Update current version"
							value="update_current"
						/>
						{showAllVersionsOption && (
							<AreaRadioGroupItem
								description="Applies this change to every version of this plan and its variants."
								label="Update all versions"
								value="update_all_versions"
							/>
						)}
					</RadioGroup>
				</div>
			)}

			{showVariants && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						Variants
					</span>
					<PropagateVariantsStep
						onToggle={(id) =>
							setSelectedVariantIds((prev) =>
								prev.includes(id)
									? prev.filter((variantId) => variantId !== id)
									: [...prev, id],
							)
						}
						selectedIds={selectedVariantIds}
						variants={variantConflicts}
					/>
				</div>
			)}

			{migrateAvailable && (
				<div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-foreground text-sm">
							Create migration draft
						</span>
						<span className="text-muted-foreground text-xs">
							Moves the{" "}
							{plan.customer_count > 0
								? `${plan.customer_count} existing customer${plan.customer_count === 1 ? "" : "s"}`
								: "existing customers"}{" "}
							onto the new plan shape. Review and run it separately after —
							customers you don't migrate stay on their current version.
						</span>
					</div>
					<Switch
						checked={migrationDraft}
						onCheckedChange={setMigrationDraft}
					/>
				</div>
			)}

			{status === "submitted" ? (
				<span className="text-tertiary-foreground text-xs">Decision sent</span>
			) : (
				<div className="flex gap-2 pt-1">
					<Button onClick={handleSubmit} size="sm" variant="primary">
						Continue
					</Button>
				</div>
			)}
		</div>
	);
}
