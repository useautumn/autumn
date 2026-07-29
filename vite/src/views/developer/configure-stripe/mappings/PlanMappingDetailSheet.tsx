import type { CatalogGetMappingsResponse, ProductV2 } from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useAppForm } from "@/hooks/form/form";
import { useCatalogMappings } from "@/hooks/queries/catalog/useCatalogMappings";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useStripeProductsResolveQuery } from "@/hooks/queries/useStripeProductsResolveQuery";
import { CatalogMappingSaveConfirmDialog } from "./CatalogMappingSaveConfirmDialog";
import {
	buildPlanDetailFormValues,
	buildUpdatePlanMappingParams,
	type CatalogPlanMapping,
	collectPlanStripeProductIds,
	findPlanMapping,
	getAffectedCatalogPriceIds,
	groupPlanMappings,
	resolveMapping,
} from "./catalogMappingsForm";
import { ItemMappingLabel } from "./ItemMappingLabel";
import { MappingField } from "./MappingField";
import { PlanMappingDetailSkeleton } from "./PlanMappingDetailSkeleton";
import { useStripeProductSearch } from "./useStripeProductSearch";

const PlanMappingDetailForm = ({
	base,
	variants,
	products,
	planMapping,
	mappings,
	onClose,
}: {
	base: ProductV2;
	variants: ProductV2[];
	products: ProductV2[];
	planMapping: CatalogPlanMapping;
	mappings: CatalogGetMappingsResponse;
	onClose: () => void;
}) => {
	const { updateMappings, isSaving } = useCatalogMappings();
	const { features } = useFeaturesQuery();
	const [variantsExpanded, setVariantsExpanded] = useState(false);
	const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
	const {
		stripeProducts,
		isResolving,
		isLoading: isResolvingInitial,
	} = useStripeProductsResolveQuery({
		stripeProductIds: collectPlanStripeProductIds(planMapping),
		enabled: mappings.stripe_connected,
	});
	const { setSearch, knownStripeProducts, selectStripeProducts, isSearching } =
		useStripeProductSearch({
			knownProducts: stripeProducts,
			enabled: true,
		});
	const hasVariants = variants.length > 0;
	const productVersions = products.length > 0 ? products : [base, ...variants];

	const knownStripeProductsById = new Map(
		knownStripeProducts.map((product) => [product.id, product]),
	);

	const form = useAppForm({
		defaultValues: buildPlanDetailFormValues(planMapping),
		onSubmit: async ({ value }) => {
			await updateMappings(
				buildUpdatePlanMappingParams({ planMapping, values: value }),
			);
			setConfirmSaveOpen(false);
			onClose();
		},
	});

	const baseStripeProductId = useStore(
		form.store,
		(state) => state.values.stripe_product_id,
	);
	const itemStripeProductIds = useStore(
		form.store,
		(state) => state.values.item_mappings,
	);
	const affectedPriceIds = getAffectedCatalogPriceIds({
		base,
		products: productVersions,
		planMapping,
		values: {
			stripe_product_id: baseStripeProductId,
			item_mappings: itemStripeProductIds,
		},
	});

	const baseResolved = resolveMapping({
		stripeProductId: baseStripeProductId,
		backendStatus: planMapping.mapping.status,
		stripeConnected: mappings.stripe_connected,
		stripeProductsById: knownStripeProductsById,
		isResolving,
	});

	if (isResolvingInitial) {
		return (
			<>
				<PlanMappingDetailSkeleton
					itemCount={planMapping.item_mappings.length}
				/>
				<SheetFooter>
					<ShortcutButton
						className="w-full"
						onClick={onClose}
						singleShortcut="escape"
						variant="secondary"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton className="w-full" disabled>
						Save mappings
					</ShortcutButton>
				</SheetFooter>
			</>
		);
	}

	return (
		<>
			<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
				<div className="flex flex-col gap-2">
					<h3 className="text-sub">Base plan</h3>
					<MappingField
						expanded={variantsExpanded}
						isSearching={isSearching}
						knownProducts={knownStripeProducts}
						label={base.name}
						onSearchChange={setSearch}
						onStripeProductChange={(value) =>
							form.setFieldValue("stripe_product_id", value)
						}
						onToggleExpanded={
							hasVariants
								? () => setVariantsExpanded((value) => !value)
								: undefined
						}
						status={baseResolved.status}
						statusPending={baseResolved.pending}
						stripeProductId={baseStripeProductId}
						stripeProducts={selectStripeProducts}
						sublabel={
							hasVariants ? (
								<span className="shrink-0 text-tertiary-foreground text-xs">
									{variants.length} variant{variants.length === 1 ? "" : "s"}
								</span>
							) : undefined
						}
					/>
					{hasVariants && (
						<AnimatePresence initial={false}>
							{variantsExpanded && (
								<motion.div
									animate={{ height: "auto", opacity: 1 }}
									className="overflow-hidden"
									exit={{ height: 0, opacity: 0 }}
									initial={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
								>
									<div className="flex flex-col gap-1 pt-1 pl-5">
										{variants.map((variant) => (
											<div
												className="flex min-w-0 items-center gap-2 text-xs"
												key={variant.id}
											>
												<span className="text-tertiary-foreground">└</span>
												<span className="truncate text-foreground">
													{variant.name}
												</span>
												<span className="ml-auto shrink-0 text-tertiary-foreground">
													Inherits mapping
												</span>
											</div>
										))}
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					)}
				</div>

				{planMapping.item_mappings.length > 0 && (
					<div className="flex flex-col gap-4">
						<h3 className="text-sub">Item mappings</h3>
						{planMapping.item_mappings.map((item, index) => {
							const stripeProductId =
								itemStripeProductIds[index]?.stripe_product_id ?? null;
							const itemResolved = resolveMapping({
								stripeProductId,
								backendStatus: item.mapping.status,
								stripeConnected: mappings.stripe_connected,
								stripeProductsById: knownStripeProductsById,
								isResolving,
							});

							return (
								<MappingField
									isSearching={isSearching}
									key={`${item.label}-${index}`}
									knownProducts={knownStripeProducts}
									label={
										<ItemMappingLabel
											base={base}
											features={features}
											itemMapping={item}
											products={productVersions}
											stripeProductId={item.mapping.stripe_product_id}
										/>
									}
									onSearchChange={setSearch}
									onStripeProductChange={(value) =>
										form.setFieldValue(
											`item_mappings[${index}].stripe_product_id` as never,
											value as never,
										)
									}
									status={itemResolved.status}
									statusPending={itemResolved.pending}
									stripeProductId={stripeProductId}
									stripeProducts={selectStripeProducts}
								/>
							);
						})}
					</div>
				)}
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
				<form.Subscribe selector={(state) => state.isDirty}>
					{(isDirty) => (
						<ShortcutButton
							className="w-full"
							disabled={!isDirty || isSaving}
							isLoading={isSaving}
							metaShortcut="enter"
							onClick={() => setConfirmSaveOpen(true)}
						>
							Save mappings
						</ShortcutButton>
					)}
				</form.Subscribe>
			</SheetFooter>

			<CatalogMappingSaveConfirmDialog
				affectedPriceIds={affectedPriceIds}
				isSaving={isSaving}
				onConfirm={() => form.handleSubmit()}
				onOpenChange={setConfirmSaveOpen}
				open={confirmSaveOpen}
			/>
		</>
	);
};

export const PlanMappingDetailSheet = ({
	planId,
	onOpenChange,
}: {
	planId: string | null;
	onOpenChange: (open: boolean) => void;
}) => {
	const { mappings } = useCatalogMappings();
	const { products } = useProductsQuery();
	const { products: allProducts } = useProductsQuery({ allVersions: true });

	const group = planId
		? groupPlanMappings(products).find((entry) => entry.base.id === planId)
		: undefined;
	const planMapping =
		mappings && planId ? findPlanMapping({ mappings, planId }) : undefined;
	const isReady = Boolean(group && planMapping && mappings);

	return (
		<Sheet onOpenChange={onOpenChange} open={Boolean(planId)}>
			{planId && isReady && group && planMapping && mappings && (
				<SheetContent className="flex flex-col overflow-hidden sm:max-w-xl">
					<SheetHeader
						description="Map this plan and its items to Stripe products. Saving updates every version and variant."
						title={group.base.name}
					/>
					<PlanMappingDetailForm
						base={group.base}
						mappings={mappings}
						onClose={() => onOpenChange(false)}
						planMapping={planMapping}
						products={allProducts}
						variants={group.variants.map((variant) => variant.plan)}
					/>
				</SheetContent>
			)}
		</Sheet>
	);
};
