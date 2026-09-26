import type { CatalogGetMappingsResponse, ProductV2 } from "@autumn/shared";
import { CopyButton, Skeleton } from "@autumn/ui";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useStripeProductsResolveQuery } from "@/hooks/queries/useStripeProductsResolveQuery";
import {
	SETTINGS_ROW_CLASS,
	SettingsTable,
	TableCell,
	TableRow,
} from "@/views/settings/SettingsTable";
import {
	collectPlanStripeProductIds,
	findPlanMapping,
	groupPlanMappings,
	rollupPlanStatus,
} from "./catalogMappingsForm";
import { MappingStatusBadge } from "./MappingStatusBadge";

const COLUMNS = [
	{ label: "Plan", width: "50%" },
	{ label: "Stripe product", width: "28%" },
	{ label: "Status", width: "17%" },
];

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
		<SettingsTable columns={COLUMNS}>
			{groups.map((group) => {
				const planMapping = findPlanMapping({
					mappings,
					planId: group.base.id,
				});
				const baseStripeProductId =
					planMapping?.mapping.stripe_product_id ?? null;
				const rollup = rollupPlanStatus({
					planMapping,
					stripeConnected: mappings.stripe_connected,
					stripeProductsById,
					isResolving,
				});

				return (
					<TableRow
						className={`${SETTINGS_ROW_CLASS} group cursor-pointer`}
						key={group.base.id}
						onClick={() => onSelectPlan(group.base.id)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onSelectPlan(group.base.id);
							}
						}}
						tabIndex={0}
					>
						<TableCell className="pl-4">
							<span className="flex min-w-0 items-center gap-2">
								<span className="truncate font-medium text-foreground text-sm">
									{group.base.name}
								</span>
								<CopyButton
									className="shrink-0 text-tertiary-foreground"
									innerClassName="max-w-30 text-tiny-id truncate"
									size="mini"
									text={group.base.id}
								/>
								{group.variants.length > 0 && (
									<span className="shrink-0 text-tertiary-foreground text-xs">
										{group.variants.length} variant
										{group.variants.length === 1 ? "" : "s"}
									</span>
								)}
							</span>
						</TableCell>
						<TableCell className="truncate text-sm">
							{baseStripeProductId
								? (stripeProductsById.get(baseStripeProductId)?.name ??
									baseStripeProductId)
								: "No Stripe product"}
						</TableCell>
						<TableCell>
							{rollup.pending ? (
								<Skeleton className="h-5 w-16" />
							) : (
								<MappingStatusBadge status={rollup.status} />
							)}
						</TableCell>
						<TableCell>
							<CaretRightIcon
								className="size-4 text-tertiary-foreground group-hover:text-foreground"
								size={14}
							/>
						</TableCell>
					</TableRow>
				);
			})}
		</SettingsTable>
	);
};
