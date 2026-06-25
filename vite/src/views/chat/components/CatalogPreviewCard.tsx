import {
	type CatalogFeaturePreview,
	type CatalogPreviewUpdateResponse,
	FeatureUsageType,
} from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import type { ResolvedFeature, ResolveFeature } from "./CreditSchemaSheet";
import { CreditSystemRow, isCreditSystem } from "./CreditSystemRow";
import { PlanPreviewCard, PlansBackdrop } from "./PlanPreviewCard";

/** One feature as a list row: type icon (hover for the type label) + name + id,
 * with the type label trailing — mirrors the Features table. */
const FeatureRow = ({ entry }: { entry: CatalogFeaturePreview }) => {
	const { feature, blockers } = entry;
	const config = getFeatureIconConfig(
		feature.type,
		feature.consumable === false ? FeatureUsageType.Continuous : undefined,
	);
	return (
		<div className="flex flex-col gap-1 px-3 py-2">
			<div className="flex items-center gap-2.5">
				<span className={config.color} title={config.label}>
					{config.icon}
				</span>
				<span className="font-medium text-foreground text-sm">
					{feature.name}
				</span>
				<span className="font-mono text-tertiary-foreground text-xs">
					{feature.id}
				</span>
				<span className="ml-auto text-tertiary-foreground text-xs">
					{config.label}
				</span>
			</div>
			{blockers?.map((blocker) => (
				<span
					key={blocker.code}
					className="text-red-600 text-xs dark:text-red-500"
				>
					{blocker.message}
				</span>
			))}
		</div>
	);
};

/** The proposed catalog change, rendered inline in the chat. Features are a
 * compact list; plans are pricing cards on a dotted backdrop. */
export function CatalogPreviewCard({
	preview,
}: {
	preview: CatalogPreviewUpdateResponse;
}) {
	const { features: orgFeatures } = useFeaturesQuery();
	const features = preview.features ?? [];
	const plans = preview.plans ?? [];
	if (!features.length && !plans.length) return null;

	// Feature types power the per-item icons (the item itself only carries the
	// feature id + server-resolved display text).
	const featuresById = new Map(
		orgFeatures.map((feature) => [feature.id, feature]),
	);

	// Resolve a feature id across the org's features and the ones in this preview
	// (a credit system can reference features created in the same call).
	const featureMeta = new Map<string, ResolvedFeature>(
		orgFeatures.map((feature) => [
			feature.id,
			{
				name: feature.name,
				type: feature.type,
				usageType: feature.config?.usage_type,
			},
		]),
	);
	for (const entry of features) {
		featureMeta.set(entry.feature.id, {
			name: entry.feature.name,
			type: entry.feature.type,
			usageType:
				entry.feature.consumable === false
					? FeatureUsageType.Continuous
					: FeatureUsageType.Single,
		});
	}
	const resolveFeature: ResolveFeature = (featureId) =>
		featureMeta.get(featureId) ?? { name: featureId };

	const versionedPlans = plans
		.filter((plan) => plan.will_version)
		.map((plan) => plan.name || plan.id);

	return (
		<div className="flex flex-col gap-3">
			{versionedPlans.length > 0 && (
				<InfoBox classNames={{ infoBox: "max-w-xl" }} variant="warning">
					This creates a new version of{" "}
					<span className="font-medium">{versionedPlans.join(", ")}</span> —
					existing customers stay on their current version until migrated.
				</InfoBox>
			)}
			{features.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						Features
					</span>
					<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
						{features.map((entry) =>
							isCreditSystem(entry.feature) ? (
								<CreditSystemRow
									feature={entry.feature}
									key={entry.feature.id}
									resolveFeature={resolveFeature}
								/>
							) : (
								<FeatureRow entry={entry} key={entry.feature.id} />
							),
						)}
					</div>
				</div>
			)}
			{plans.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<span className="font-medium text-tertiary-foreground text-xs">
						Plans
					</span>
					<PlansBackdrop>
						{plans.map((plan) => (
							<PlanPreviewCard
								key={plan.id}
								diff={plan.diff}
								featuresById={featuresById}
								plan={plan}
							/>
						))}
					</PlansBackdrop>
				</div>
			)}
		</div>
	);
}
