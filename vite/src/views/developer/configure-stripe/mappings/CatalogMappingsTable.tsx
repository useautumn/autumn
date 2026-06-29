import type { CatalogGetMappingsResponse, ProductV2 } from "@autumn/shared";
import { Skeleton } from "@autumn/ui";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useStripeProductsResolveQuery } from "@/hooks/queries/useStripeProductsResolveQuery";
import {
	collectPlanStripeProductIds,
	findPlanMapping,
	groupPlanMappings,
	rollupPlanStatus,
} from "./catalogMappingsForm";
import { MappingStatusBadge } from "./MappingStatusBadge";

export const CatalogMappingsTable = ({
	mappings,
	products,
	onSelectPlan,
}: {
	mappings: CatalogGetMappingsResponse;
	products: ProductV2[];
	onSelectPlan: (planId: string) => void;
}) => {
	const groups = groupPlanMappings(products);

	const allStripeProductIds = mappings.plan_mappings.flatMap((planMapping) =>
		collectPlanStripeProductIds(planMapping),
	);
	const { stripeProductsById, isResolving } = useStripeProductsResolveQuery({
		stripeProductIds: allStripeProductIds,
		enabled: mappings.stripe_connected,
	});

	return (
		<div>
			<div className="flex items-center gap-3 border-border/60 border-b py-2 text-tertiary-foreground text-xs">
				<span className="flex-1">Plan</span>
				<span className="w-[200px] shrink-0">Stripe product</span>
				<span className="w-[72px] shrink-0 text-right">Items</span>
				<span className="w-[104px] shrink-0 text-right">Status</span>
				<span className="w-4 shrink-0" />
			</div>
			<div className="divide-y divide-border/60">
				{groups.map((group) => {
					const planMapping = findPlanMapping({
						mappings,
						planId: group.base.id,
					});
					const itemMappings = planMapping?.item_mappings ?? [];
					const mappedItems = itemMappings.filter(
						(item) => item.mapping.stripe_product_id,
					).length;
					const baseStripeProductId =
						planMapping?.mapping.stripe_product_id ?? null;
					const rollup = rollupPlanStatus({
						planMapping,
						stripeConnected: mappings.stripe_connected,
						stripeProductsById,
						isResolving,
					});

					return (
						<button
							className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-accent"
							key={group.base.id}
							onClick={() => onSelectPlan(group.base.id)}
							type="button"
						>
							<span className="flex min-w-0 flex-1 items-center gap-2">
								<span className="truncate font-medium text-sm">
									{group.base.name}
								</span>
								{group.variants.length > 0 && (
									<span className="shrink-0 text-tertiary-foreground text-xs">
										{group.variants.length} variant
										{group.variants.length === 1 ? "" : "s"}
									</span>
								)}
							</span>
							<span className="w-[200px] shrink-0 truncate text-tertiary-foreground text-xs">
								{baseStripeProductId
									? (stripeProductsById.get(baseStripeProductId)?.name ??
										baseStripeProductId)
									: "No Stripe product"}
							</span>
							<span className="w-[72px] shrink-0 text-right text-tertiary-foreground text-xs tabular-nums">
								{itemMappings.length > 0
									? `${mappedItems}/${itemMappings.length}`
									: "—"}
							</span>
							<span className="flex w-[104px] shrink-0 justify-end">
								{rollup.pending ? (
									<Skeleton className="h-5 w-16" />
								) : (
									<MappingStatusBadge status={rollup.status} />
								)}
							</span>
							<CaretRightIcon
								className="size-4 shrink-0 text-tertiary-foreground group-hover:text-foreground"
								size={14}
							/>
						</button>
					);
				})}
			</div>
		</div>
	);
};
