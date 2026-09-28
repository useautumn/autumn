import type { Feature, ProductV2 } from "@autumn/shared";
import { Skeleton } from "@autumn/ui";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useStripeProductsResolveQuery } from "@/hooks/queries/useStripeProductsResolveQuery";
import {
	SETTINGS_ROW_CLASS,
	SettingsTable,
	TableCell,
	TableRow,
} from "@/views/settings/SettingsTable";
import { resolveMapping } from "./catalogMappingsForm";
import { MappingStatusBadge } from "./MappingStatusBadge";
import {
	featurePriceMappingRows,
	featureStripeProductIds,
	pricedFeatures,
	rowUsesAnotherProduct,
} from "./priceMappingRows";

const COLUMNS = [
	{ label: "Feature", width: "50%" },
	{ label: "Stripe product", width: "28%" },
	{ label: "Status", width: "17%" },
];

const pricedInLabel = ({
	featureId,
	latestProducts,
}: {
	featureId: string;
	latestProducts: ProductV2[];
}) => {
	const planCount = latestProducts.filter((product) =>
		product.items.some(
			(item) => item.feature_id === featureId && item.price_id,
		),
	).length;
	if (planCount === 0) return null;
	return `${planCount} plan${planCount === 1 ? "" : "s"}`;
};

export const FeatureMappingsTable = ({
	features,
	latestProducts,
	allVersions,
	stripeConnected,
	onSelectFeature,
}: {
	features: Feature[];
	latestProducts: ProductV2[];
	allVersions: ProductV2[];
	stripeConnected: boolean;
	onSelectFeature: (featureId: string) => void;
}) => {
	const featureRows = pricedFeatures({ products: allVersions, features }).map(
		(feature) => {
			const priceRows = featurePriceMappingRows({
				products: allVersions,
				featureId: feature.id,
				features,
			});
			const defaultProductId = feature.stripe_product_id ?? null;
			return {
				feature,
				defaultProductId,
				productIds: featureStripeProductIds({
					rows: priceRows,
					defaultStripeProductId: defaultProductId,
				}),
				otherCount: priceRows.filter((row) =>
					rowUsesAnotherProduct({
						row,
						defaultStripeProductId: defaultProductId,
					}),
				).length,
			};
		},
	);
	const { stripeProductsById, isResolving } = useStripeProductsResolveQuery({
		stripeProductIds: featureRows.flatMap((row) => row.productIds),
		enabled: stripeConnected,
	});
	const productName = (productId: string) =>
		stripeProductsById.get(productId)?.name ?? productId;

	if (featureRows.length === 0) {
		return (
			<div className="rounded-md border border-border/60 px-3 py-2 text-tertiary-foreground text-xs">
				No plan charges for a feature yet.
			</div>
		);
	}

	return (
		<SettingsTable columns={COLUMNS}>
			{featureRows.map(
				({ feature, defaultProductId, productIds, otherCount }) => {
					const isMixed = productIds.length > 1;
					// Without a default, a single shared product is effectively the default.
					const shownProductId = defaultProductId ?? productIds[0] ?? null;
					const status = isMixed
						? { status: "conflict" as const, pending: false }
						: resolveMapping({
								stripeProductId: shownProductId,
								stripeConnected,
								stripeProductsById,
								isResolving,
							});
					const productLabel = !shownProductId
						? "Created on first checkout"
						: defaultProductId || !isMixed
							? productName(shownProductId)
							: `${productIds.length} Stripe products`;
					const pricedIn = pricedInLabel({
						featureId: feature.id,
						latestProducts,
					});

					return (
						<TableRow
							className={`${SETTINGS_ROW_CLASS} group cursor-pointer`}
							key={feature.id}
							onClick={() => onSelectFeature(feature.id)}
						>
							<TableCell className="max-w-0 pr-6 pl-4">
								<span className="flex min-w-0 flex-col">
									<span className="truncate font-medium text-foreground text-sm">
										{feature.name}
									</span>
									{pricedIn && (
										<span className="truncate text-tertiary-foreground text-xs">
											{pricedIn}
										</span>
									)}
								</span>
							</TableCell>
							<TableCell className="max-w-0 pr-6 text-sm">
								<span className="flex min-w-0 flex-col">
									<span className="truncate">{productLabel}</span>
									{defaultProductId && otherCount > 0 && (
										<span className="truncate text-tertiary-foreground text-xs">
											{otherCount} {otherCount === 1 ? "uses" : "use"} another
											product
										</span>
									)}
								</span>
							</TableCell>
							<TableCell>
								{status.pending ? (
									<Skeleton className="h-5 w-16" />
								) : (
									<MappingStatusBadge status={status.status} />
								)}
							</TableCell>
							<TableCell>
								{/* Keyboard access for the row; its click bubbles to the row handler. */}
								<button
									aria-label={`Open ${feature.name} mapping`}
									className="flex rounded-sm"
									type="button"
								>
									<CaretRightIcon
										className="size-4 text-tertiary-foreground group-hover:text-foreground"
										size={14}
									/>
								</button>
							</TableCell>
						</TableRow>
					);
				},
			)}
		</SettingsTable>
	);
};
