import type { Feature } from "@autumn/shared";
import { SectionTag } from "@autumn/ui";
import { useOrg } from "@/hooks/common/useOrg";
import type { ProductListItem } from "@/hooks/queries/useProductsQuery";
import {
	getFeatureIcon,
	getFeatureIconConfig,
} from "@/views/products/features/utils/getFeatureIcon";
import { CreditSystemCard } from "./CreditSystemCard";
import { buildPlanGroups, splitCreditSystems } from "./catalogGrouping";
import { PanelSection } from "./PanelSection";
import { PlanTrack } from "./PlanTrack";

/** Three rows of the 4-column grid. */
const MAX_FEATURES = 12;

/** Credits and features share one column count so the two strips align, and
 * a lone cell keeps a column's width rather than stretching or shrinking. */
const CATALOG_GRID = "grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4";

function FeatureChip({ feature }: { feature: Feature }) {
	const config = getFeatureIconConfig(feature.type, feature.config?.usage_type);

	return (
		<span
			className="flex min-w-0 items-center gap-1.5 rounded-md border bg-interactive-secondary px-2 py-1"
			title={config.label}
		>
			{getFeatureIcon({ feature, size: 12 })}
			<span className="truncate text-tiny text-foreground">{feature.name}</span>
		</span>
	);
}

export function CatalogPanel({
	products,
	features,
	isLoading,
}: {
	products: ProductListItem[];
	features: Feature[];
	isLoading?: boolean;
}) {
	const { org } = useOrg();
	const groups = buildPlanGroups({ products });
	const { creditSystems, plainFeatures } = splitCreditSystems({ features });
	const hiddenFeatures = plainFeatures.length - MAX_FEATURES;

	if (groups.length === 0) {
		return (
			<PanelSection
				isLoading={isLoading}
				isEmpty={!isLoading}
				loadingText="Loading plans"
				emptyText="Your plans will show up here"
			/>
		);
	}

	return (
		<div className="flex min-w-0 flex-col gap-5">
			{groups.map((group) => (
				<PlanTrack
					key={group.label}
					group={group}
					currency={org?.default_currency}
				/>
			))}

			{creditSystems.length > 0 && (
				<div className="flex min-w-0 flex-col">
					<SectionTag>Credits</SectionTag>
					{/* Same column count as the features below, so the two strips line
					    up rather than each cell finding its own width. */}
					<div className={CATALOG_GRID}>
						{creditSystems.map((creditSystem) => (
							<CreditSystemCard
								key={creditSystem.id}
								creditSystem={creditSystem}
								features={features}
							/>
						))}
					</div>
				</div>
			)}

			{plainFeatures.length > 0 && (
				<div className="flex min-w-0 flex-col">
					<SectionTag>Features</SectionTag>
					{/* A fixed grid rather than wrapped chips: uniform columns line the
					    features up with the plan track above instead of ragging. */}
					<div className={CATALOG_GRID}>
						{plainFeatures.slice(0, MAX_FEATURES).map((feature) => (
							<FeatureChip key={feature.id} feature={feature} />
						))}
						{hiddenFeatures > 0 && (
							<span className="flex items-center px-2 text-tiny text-subtle">
								+{hiddenFeatures} more
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
