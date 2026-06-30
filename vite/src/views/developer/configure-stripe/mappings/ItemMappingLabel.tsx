import type { Feature, ProductV2 } from "@autumn/shared";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@autumn/ui";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { cn } from "@/lib/utils";
import type { CatalogPlanMapping } from "./catalogMappingsForm";
import {
	type CatalogItemMappingMatch,
	catalogItemFilterToDisplayParts,
	filterCatalogItemMatchesByStripeProduct,
	getCatalogItemMappingMatches,
} from "./itemMappingDisplay";

type CatalogItemMapping = CatalogPlanMapping["item_mappings"][number];
type ItemFilterDisplay = ReturnType<typeof catalogItemFilterToDisplayParts>;

const ItemFilterTitle = ({ display }: { display: ItemFilterDisplay }) => (
	<span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
		<span className="truncate">{display.featureName}</span>
		{display.badges.map((badge) => (
			<span
				className="shrink-0 rounded-md border border-border/60 bg-muted px-1.5 py-0.5 font-normal text-[11px] text-tertiary-foreground leading-none"
				key={badge}
			>
				{badge}
			</span>
		))}
	</span>
);

const ProductVersionLabel = ({ match }: { match: CatalogItemMappingMatch }) => (
	<div className="flex min-w-0 items-center gap-2 text-xs">
		<span className="truncate font-medium text-foreground">
			{match.product.name}
		</span>
		<span className="shrink-0 text-tertiary-foreground">
			{match.planKind}
			{match.product.version ? ` · v${match.product.version}` : ""}
		</span>
	</div>
);

const StripeProductId = ({ value }: { value: string | null }) => (
	<span
		className={cn(
			"max-w-[180px] shrink-0 truncate font-mono text-xs",
			value ? "text-tertiary-foreground" : "text-muted-foreground",
		)}
	>
		{value ?? "No Stripe product"}
	</span>
);

const ItemMatchRow = ({ match }: { match: CatalogItemMappingMatch }) => (
	<div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-background/70 p-2">
		<div className="flex min-w-0 items-center justify-between gap-3">
			<ProductVersionLabel match={match} />
			<StripeProductId value={match.stripeProductId} />
		</div>
		<div className="flex min-w-0 items-center gap-2">
			<PlanItemLabel item={match.item} unnamedText="Unconfigured item" />
		</div>
	</div>
);

export const ItemMappingLabel = ({
	itemMapping,
	base,
	products,
	features,
	stripeProductId,
}: {
	itemMapping: CatalogItemMapping;
	base: ProductV2;
	products: ProductV2[];
	features: Feature[];
	stripeProductId: string | null;
}) => {
	const matches = getCatalogItemMappingMatches({
		base,
		products,
		filter: itemMapping.filter,
	});
	const display = catalogItemFilterToDisplayParts({
		filter: itemMapping.filter,
		features,
		matches,
	});
	const visibleMatches = filterCatalogItemMatchesByStripeProduct({
		matches,
		stripeProductId,
		showAll: itemMapping.mapping.status === "conflict",
	});

	return (
		<HoverCard>
			<HoverCardTrigger asChild closeDelay={80} delay={120}>
				<span className="inline-flex min-w-0 max-w-full cursor-help truncate border-border border-b border-dotted text-left">
					<ItemFilterTitle display={display} />
				</span>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-[520px] p-0" side="left">
				<div className="flex flex-col">
					<div className="border-border/60 border-b px-3 py-2">
						<div className="font-medium text-sm">
							<ItemFilterTitle display={display} />
						</div>
						<div className="text-tertiary-foreground text-xs">
							{visibleMatches.length} matching item
							{visibleMatches.length === 1 ? "" : "s"}
						</div>
					</div>
					<div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto p-2">
						{visibleMatches.length > 0 ? (
							visibleMatches.map((match) => (
								<ItemMatchRow
									key={`${match.product.internal_id}-${match.item.price_id}`}
									match={match}
								/>
							))
						) : (
							<div className="px-2 py-4 text-center text-tertiary-foreground text-xs">
								No saved plan items match this Stripe product.
							</div>
						)}
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
};
