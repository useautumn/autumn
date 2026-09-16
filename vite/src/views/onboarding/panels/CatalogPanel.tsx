import type { Feature } from "@autumn/shared";
import { SectionTag } from "@autumn/ui";
import { Link } from "react-router";
import { useOrg } from "@/hooks/common/useOrg";
import type { ProductListItem } from "@/hooks/queries/useProductsQuery";
import { CreditSystemCard } from "./CreditSystemCard";
import { buildPlanGroups, splitCreditSystems } from "./catalogGrouping";
import { catalogGridClassName, featurePagePath } from "./catalogUi";
import { FeatureChip } from "./FeatureChip";
import { PanelSection } from "./PanelSection";
import { PlanTrack } from "./PlanTrack";

/** Three rows of the 4-column grid. */
const MAX_FEATURES = 12;

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
					<div className={catalogGridClassName}>
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
					<div className={catalogGridClassName}>
						{plainFeatures.slice(0, MAX_FEATURES).map((feature) => (
							<FeatureChip key={feature.id} feature={feature} />
						))}
						{hiddenFeatures > 0 && (
							<Link
								to={featurePagePath()}
								className="flex items-center px-2 text-tiny text-subtle transition-colors hover:text-tertiary-foreground"
							>
								+{hiddenFeatures} more
							</Link>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
