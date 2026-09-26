import type {
	CatalogGetMappingsResponse,
	CatalogStripeProduct,
	Feature,
} from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import { useState } from "react";
import { StripePriceSelect } from "@/components/v2/selects/StripePriceSelect";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useCatalogMappings } from "@/hooks/queries/catalog/useCatalogMappings";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useStripeProductsResolveQuery } from "@/hooks/queries/useStripeProductsResolveQuery";
import { CatalogMappingSaveConfirmDialog } from "./CatalogMappingSaveConfirmDialog";
import { resolveMapping } from "./catalogMappingsForm";
import {
	affectedFeaturePriceIds,
	buildFeatureSheetSave,
	countRowsOnOtherProducts,
	type FeatureSheetValues,
	rowEffectiveProductId,
	rowPriceChoice,
	rowProductChoice,
} from "./featureMappingSave";
import { MappingField } from "./MappingField";
import { PlanMappingDetailSkeleton } from "./PlanMappingDetailSkeleton";
import { PriceMappingAccordion } from "./PriceMappingAccordion";
import {
	featurePriceMappingRows,
	groupRowsByPlan,
	type PriceMappingRow,
} from "./priceMappingRows";
import {
	CREATE_STRIPE_PRODUCT,
	StripeProductSelect,
} from "./StripeProductSelect";
import { useStripeProductSearch } from "./useStripeProductSearch";

const CREATE_LABEL = "Create new Stripe product";

const otherProductsLabel = (count: number) =>
	`${count} ${count === 1 ? "uses" : "use"} another product`;

const defaultLabel = ({
	defaultProductId,
	productsById,
}: {
	defaultProductId: string | null;
	productsById: Map<string, CatalogStripeProduct>;
}) => {
	if (defaultProductId === CREATE_STRIPE_PRODUCT)
		return "Default · New product";
	return defaultProductId
		? `Default · ${productsById.get(defaultProductId)?.name ?? defaultProductId}`
		: "Default · none";
};

const FeatureMappingDetailForm = ({
	feature,
	rows,
	mappings,
	onClose,
}: {
	feature: Feature;
	rows: PriceMappingRow[];
	mappings: CatalogGetMappingsResponse;
	onClose: () => void;
}) => {
	const { saveMappings, isSaving } = useCatalogMappings();
	const initialDefaultId = feature.stripe_product_id ?? null;
	const [values, setValues] = useState<FeatureSheetValues>({
		default_product_id: initialDefaultId,
		rows: {},
	});
	const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
	const choiceArgs = { values, initialDefaultId };

	const {
		stripeProducts,
		isResolving,
		isLoading: isResolvingInitial,
	} = useStripeProductsResolveQuery({
		stripeProductIds: [
			...(initialDefaultId ? [initialDefaultId] : []),
			...rows.flatMap((row) =>
				row.stripeProductId ? [row.stripeProductId] : [],
			),
		],
		enabled: mappings.stripe_connected,
	});
	const { setSearch, knownStripeProducts, selectStripeProducts, isSearching } =
		useStripeProductSearch({ knownProducts: stripeProducts, enabled: true });
	const productsById = new Map(
		knownStripeProducts.map((product) => [product.id, product]),
	);

	const defaultStatus = resolveMapping({
		stripeProductId:
			values.default_product_id === CREATE_STRIPE_PRODUCT
				? null
				: values.default_product_id,
		stripeConnected: mappings.stripe_connected,
		stripeProductsById: productsById,
		isResolving,
	});
	const otherCount = countRowsOnOtherProducts({ rows, ...choiceArgs });
	const isDirty =
		values.default_product_id !== initialDefaultId ||
		Object.keys(values.rows).length > 0;

	const setRowChoice = ({
		row,
		productId,
		priceId,
	}: {
		row: PriceMappingRow;
		productId: string | null;
		priceId: string | null;
	}) =>
		setValues((current) => ({
			...current,
			rows: {
				...current.rows,
				[row.priceId]: {
					// Picking the default product by name is the same as following it.
					product_id:
						productId === current.default_product_id &&
						productId !== CREATE_STRIPE_PRODUCT
							? null
							: productId,
					price_id: priceId,
				},
			},
		}));

	const handleSave = async () => {
		await saveMappings(
			buildFeatureSheetSave({
				featureId: feature.id,
				values,
				initialDefaultId,
				rows,
			}),
		);
		setConfirmSaveOpen(false);
		onClose();
	};

	if (isResolvingInitial) return <PlanMappingDetailSkeleton />;

	return (
		<>
			<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
				<MappingField
					createLabel={CREATE_LABEL}
					isResolving={isResolving || !mappings.stripe_connected}
					isSearching={isSearching}
					knownProducts={knownStripeProducts}
					label="Default product"
					onSearchChange={setSearch}
					onStripeProductChange={(value) =>
						setValues((current) => ({ ...current, default_product_id: value }))
					}
					status={defaultStatus.status}
					statusPending={defaultStatus.pending}
					stripeProductId={values.default_product_id}
					stripeProducts={selectStripeProducts}
					sublabel={
						otherCount > 0 ? (
							<span className="shrink-0 text-tertiary-foreground text-xs">
								{otherProductsLabel(otherCount)}
							</span>
						) : undefined
					}
				/>

				<div className="flex flex-col gap-3 border-border border-t pt-4">
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-sm">Prices by plan</span>
						<span className="text-tertiary-foreground text-xs">
							Pick a product and price for any version. Leave the price empty
							and Autumn creates one.
						</span>
					</div>
					{groupRowsByPlan({ rows }).map((group) => {
						const groupOtherCount = countRowsOnOtherProducts({
							rows: group.rows,
							...choiceArgs,
						});

						return (
							<PriceMappingAccordion
								columns={["Version", "Product", "Price"]}
								group={group}
								key={group.planId}
								renderRow={(row) => {
									const productChoice = rowProductChoice({
										row,
										...choiceArgs,
									});
									const productId = rowEffectiveProductId({
										row,
										...choiceArgs,
									});
									const canPickPrice =
										Boolean(productId) && productId !== CREATE_STRIPE_PRODUCT;

									return (
										<>
											<div className="min-w-0 flex-1">
												<StripeProductSelect
													createLabel={CREATE_LABEL}
													defaultProductId={values.default_product_id}
													isLoading={isSearching}
													isResolving={
														isResolving || !mappings.stripe_connected
													}
													knownProducts={knownStripeProducts}
													noneLabel={defaultLabel({
														defaultProductId: values.default_product_id,
														productsById,
													})}
													onChange={(value) =>
														setRowChoice({
															row,
															productId: value,
															priceId: null,
														})
													}
													onSearchChange={setSearch}
													products={selectStripeProducts}
													value={productChoice}
												/>
											</div>
											<div className="min-w-0 flex-1">
												<StripePriceSelect
													disabled={!canPickPrice}
													onChange={(priceId) =>
														setRowChoice({
															row,
															productId: productChoice,
															priceId,
														})
													}
													stripeProductId={canPickPrice ? productId : null}
													value={rowPriceChoice({ row, ...choiceArgs })}
												/>
											</div>
										</>
									);
								}}
								summary={
									groupOtherCount > 0
										? otherProductsLabel(groupOtherCount)
										: "All on default"
								}
							/>
						);
					})}
				</div>
			</div>

			<SheetFooter>
				<ShortcutButton
					className="w-full"
					disabled={isSaving}
					onClick={onClose}
					singleShortcut="escape"
					variant="secondary"
				>
					Cancel
				</ShortcutButton>
				<ShortcutButton
					className="w-full"
					disabled={!isDirty || isSaving}
					isLoading={isSaving}
					metaShortcut="enter"
					onClick={() => setConfirmSaveOpen(true)}
				>
					Save mapping
				</ShortcutButton>
			</SheetFooter>

			<CatalogMappingSaveConfirmDialog
				affectedPriceIds={affectedFeaturePriceIds({ rows, ...choiceArgs })}
				isSaving={isSaving}
				onConfirm={handleSave}
				onOpenChange={setConfirmSaveOpen}
				open={confirmSaveOpen}
			/>
		</>
	);
};

export const FeatureMappingDetailSheet = ({
	featureId,
	onOpenChange,
}: {
	featureId: string | null;
	onOpenChange: (open: boolean) => void;
}) => {
	const { mappings } = useCatalogMappings();
	const { features } = useFeaturesQuery();
	const { products: allVersions } = useProductsQuery({ allVersions: true });
	const feature = features.find((candidate) => candidate.id === featureId);

	return (
		<Sheet onOpenChange={onOpenChange} open={Boolean(featureId)}>
			{feature && mappings && (
				<SheetContent className="flex flex-col overflow-hidden md:max-w-3xl">
					<SheetHeader
						description="Choose the Stripe product and price each plan's price for this feature bills under."
						title={feature.name}
					/>
					<FeatureMappingDetailForm
						feature={feature}
						key={feature.id}
						mappings={mappings}
						onClose={() => onOpenChange(false)}
						rows={featurePriceMappingRows({
							products: allVersions,
							featureId: feature.id,
							features,
						})}
					/>
				</SheetContent>
			)}
		</Sheet>
	);
};
