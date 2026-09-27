import type {
	CatalogGetMappingsResponse,
	CatalogStripeProduct,
	ProductV2,
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
import {
	type CatalogPlanMapping,
	collectPlanStripeProductIds,
	findPlanMapping,
	groupPlanMappings,
	resolveMapping,
} from "./catalogMappingsForm";
import { MappingField } from "./MappingField";
import { PlanMappingDetailSkeleton } from "./PlanMappingDetailSkeleton";
import { PriceMappingAccordion } from "./PriceMappingAccordion";
import {
	affectedPlanPriceIds,
	buildPlanSheetSave,
	buildPlanSheetValues,
	displayedStripePriceId,
	effectivePlanProductId,
	type PlanSheetValues,
} from "./planMappingSave";
import { basePriceMappingRows, groupRowsByPlan } from "./priceMappingRows";
import { CREATE_STRIPE_PRODUCT } from "./StripeProductSelect";
import { useStripeProductSearch } from "./useStripeProductSearch";

const isDirty = ({
	values,
	initial,
}: {
	values: PlanSheetValues;
	initial: PlanSheetValues;
}) => JSON.stringify(values) !== JSON.stringify(initial);

const priceGroupSummary = ({
	productId,
	productsById,
}: {
	productId: string | null;
	productsById: Map<string, CatalogStripeProduct>;
}) => {
	if (productId === CREATE_STRIPE_PRODUCT) return "New product on save";
	if (!productId) return "No Stripe product";
	return `Under ${productsById.get(productId)?.name ?? productId}`;
};

const PlanMappingDetailForm = ({
	base,
	variants,
	allVersions,
	planMapping,
	mappings,
	onClose,
}: {
	base: ProductV2;
	variants: ProductV2[];
	allVersions: ProductV2[];
	planMapping: CatalogPlanMapping;
	mappings: CatalogGetMappingsResponse;
	onClose: () => void;
}) => {
	const { saveMappings, isSaving } = useCatalogMappings();
	const { features } = useFeaturesQuery();
	const [initial] = useState(() =>
		buildPlanSheetValues({ planMapping, base, variants }),
	);
	const [values, setValues] = useState(initial);
	const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

	const {
		stripeProducts,
		isResolving,
		isLoading: isResolvingInitial,
	} = useStripeProductsResolveQuery({
		stripeProductIds: [
			...collectPlanStripeProductIds(planMapping),
			...Object.values(initial.variant_product_ids).filter((id): id is string =>
				Boolean(id),
			),
		],
		enabled: mappings.stripe_connected,
	});
	const { setSearch, knownStripeProducts, selectStripeProducts, isSearching } =
		useStripeProductSearch({ knownProducts: stripeProducts, enabled: true });
	const knownProductsById = new Map(
		knownStripeProducts.map((product) => [product.id, product]),
	);

	const rows = basePriceMappingRows({
		products: allVersions,
		planIds: [base.id, ...variants.map((variant) => variant.id)],
		features,
	});
	const plans = [base, ...variants];

	const resolveStatus = (productId: string | null) =>
		resolveMapping({
			stripeProductId: productId === CREATE_STRIPE_PRODUCT ? null : productId,
			backendStatus: planMapping.mapping.status,
			stripeConnected: mappings.stripe_connected,
			stripeProductsById: knownProductsById,
			isResolving,
		});

	const setPlanProductId = ({
		planId,
		productId,
	}: {
		planId: string;
		productId: string | null;
	}) =>
		setValues((current) =>
			planId === base.id
				? { ...current, stripe_product_id: productId }
				: {
						...current,
						variant_product_ids: {
							...current.variant_product_ids,
							[planId]: productId,
						},
					},
		);

	const handleSave = async () => {
		await saveMappings(
			buildPlanSheetSave({ planMapping, values, initial, rows }),
		);
		setConfirmSaveOpen(false);
		onClose();
	};

	if (isResolvingInitial) {
		return <PlanMappingDetailSkeleton />;
	}

	return (
		<>
			<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
				<div className="flex flex-col divide-y divide-border">
					{plans.map((plan) => {
						const isBase = plan.id === base.id;
						const productId = isBase
							? values.stripe_product_id
							: (values.variant_product_ids[plan.id] ?? null);
						// Creating only runs for a plan without its own product, so otherwise it'd do nothing.
						const savedProductId = isBase
							? initial.stripe_product_id
							: (initial.variant_product_ids[plan.id] ?? null);
						const status = resolveStatus(
							effectivePlanProductId({
								values,
								basePlanId: base.id,
								planId: plan.id,
							}),
						);

						return (
							<div className="py-4 first:pt-0" key={plan.id}>
								<MappingField
									isResolving={isResolving || !mappings.stripe_connected}
									createLabel={
										savedProductId
											? undefined
											: isBase
												? "Create new Stripe product"
												: `Create new product · ${plan.name}`
									}
									isSearching={isSearching}
									knownProducts={knownStripeProducts}
									label={plan.name}
									noneLabel={
										isBase ? "No Stripe product" : `Same as ${base.name}`
									}
									onSearchChange={setSearch}
									onStripeProductChange={(value) =>
										setPlanProductId({ planId: plan.id, productId: value })
									}
									status={status.status}
									statusPending={status.pending}
									stripeProductId={productId}
									stripeProducts={selectStripeProducts}
									sublabel={
										<span className="shrink-0 text-tertiary-foreground text-xs">
											{isBase ? "Base plan" : "Variant"}
										</span>
									}
								/>
							</div>
						);
					})}
				</div>

				{rows.length > 0 && (
					<div className="flex flex-col gap-3 border-border border-t pt-4">
						<div className="flex flex-col gap-0.5">
							<span className="font-medium text-sm">Base prices</span>
							<span className="text-tertiary-foreground text-xs">
								Point any version at a Stripe price you already have. Leave it
								empty and Autumn creates one.
							</span>
						</div>
						{groupRowsByPlan({ rows }).map((group) => {
							const productId = effectivePlanProductId({
								values,
								basePlanId: base.id,
								planId: group.planId,
							});
							const canPickPrice =
								Boolean(productId) && productId !== CREATE_STRIPE_PRODUCT;

							return (
								<PriceMappingAccordion
									columns={["Version", "Stripe price"]}
									group={group}
									key={group.planId}
									renderRow={(row) => (
										<div className="min-w-0 flex-1">
											<StripePriceSelect
												disabled={!canPickPrice}
												onChange={(stripePriceId) =>
													setValues((current) => ({
														...current,
														price_ids: {
															...current.price_ids,
															[row.priceId]: stripePriceId,
														},
													}))
												}
												stripeProductId={canPickPrice ? productId : null}
												value={displayedStripePriceId({
													row,
													values,
													initial,
													basePlanId: base.id,
												})}
											/>
										</div>
									)}
									summary={priceGroupSummary({
										productId,
										productsById: knownProductsById,
									})}
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
				<ShortcutButton
					className="w-full"
					disabled={!isDirty({ values, initial }) || isSaving}
					isLoading={isSaving}
					metaShortcut="enter"
					onClick={() => setConfirmSaveOpen(true)}
				>
					Save mapping
				</ShortcutButton>
			</SheetFooter>

			<CatalogMappingSaveConfirmDialog
				affectedPriceIds={affectedPlanPriceIds({
					values,
					initial,
					rows,
					basePlanId: base.id,
				})}
				isSaving={isSaving}
				onConfirm={handleSave}
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
	const { products: allVersions } = useProductsQuery({ allVersions: true });

	const group = planId
		? groupPlanMappings(products).find((entry) => entry.base.id === planId)
		: undefined;
	const planMapping =
		mappings && planId ? findPlanMapping({ mappings, planId }) : undefined;

	return (
		<Sheet onOpenChange={onOpenChange} open={Boolean(planId)}>
			{planId && group && planMapping && mappings && (
				<SheetContent className="flex flex-col overflow-hidden md:max-w-2xl">
					<SheetHeader
						description="Pick the Stripe product each plan bills under, and any existing Stripe prices. Changes apply to every version."
						title={group.base.name}
					/>
					<PlanMappingDetailForm
						allVersions={allVersions}
						base={group.base}
						key={planId}
						mappings={mappings}
						onClose={() => onOpenChange(false)}
						planMapping={planMapping}
						variants={group.variants.map((variant) => variant.plan)}
					/>
				</SheetContent>
			)}
		</Sheet>
	);
};
