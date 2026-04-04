import type { FrontendProduct, FullCusProduct } from "@autumn/shared";
import { FreeTrialDuration, productV2ToFrontendProduct } from "@autumn/shared";
import { useCallback, useMemo, useState } from "react";
import {
	getProductWithSupportedPlanFormValues,
	getSupportedPlanFormPatchFromDraftProduct,
} from "@/components/forms/shared/utils/planCustomizationUtils";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Button } from "@/components/v2/buttons/Button";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEnv } from "@/utils/envUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useSyncProposals } from "./hooks/useSyncProposals";
import { SyncProposalCard } from "./SyncProposalCard";
import type { SyncMapping, SyncProposal } from "./syncStripeTypes";
import { hasActiveProductInGroup } from "./syncStripeUtils";

/** Build default mappings from proposals — auto-select matched plans. */
const buildDefaultMappings = ({
	proposals,
	products,
	customerProducts,
}: {
	proposals: SyncProposal[];
	products: import("@autumn/shared").ProductV2[];
	customerProducts: FullCusProduct[];
}): Record<string, SyncMapping[]> => {
	const mappings: Record<string, SyncMapping[]> = {};

	for (const proposal of proposals) {
		const firstMatch = proposal.items.find((item) => item.matched_plan_id);
		if (!firstMatch?.matched_plan_id) continue;

		const hasExisting = hasActiveProductInGroup({
			planId: firstMatch.matched_plan_id,
			products,
			customerProducts,
		});

		mappings[proposal.stripe_subscription_id] = [
			{
				stripe_subscription_id: proposal.stripe_subscription_id,
				plan_id: firstMatch.matched_plan_id,
				expire_previous: hasExisting,
				enabled: true,
				items: null,
			},
		];
	}

	return mappings;
};

export function SyncStripeSheet() {
	const { customer, refetch: refetchCustomer } = useCusQuery();
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { products } = useProductsQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();
	const { setIsInlineEditorOpen } = useCustomerContext();

	const { proposals, isLoading, error, syncMutation } = useSyncProposals({
		customerId: customer?.id ?? "",
	});

	const [mappings, setMappings] = useState<Record<string, SyncMapping[]>>({});
	const [initialized, setInitialized] = useState(false);

	const customerProducts: FullCusProduct[] = customer?.customer_products ?? [];

	// InlinePlanEditor state
	const [editingMapping, setEditingMapping] = useState<{
		subscriptionId: string;
		mappingIndex: number;
	} | null>(null);

	if (proposals.length > 0 && !initialized) {
		setMappings(
			buildDefaultMappings({
				proposals,
				products: products ?? [],
				customerProducts,
			}),
		);
		setInitialized(true);
	}

	const handleMappingsChange = useCallback(
		({
			subscriptionId,
			updatedMappings,
		}: {
			subscriptionId: string;
			updatedMappings: SyncMapping[];
		}) => {
			setMappings((prev) => ({
				...prev,
				[subscriptionId]: updatedMappings,
			}));
		},
		[],
	);

	const confirmedMappings = Object.values(mappings)
		.flat()
		.filter((m) => m.enabled && m.plan_id);

	const handleSync = () => {
		if (confirmedMappings.length === 0) return;
		syncMutation.mutate(
			{ mappings: confirmedMappings },
			{
				onSuccess: () => {
					refetchCustomer();
					closeSheet();
				},
			},
		);
	};

	// InlinePlanEditor: build FrontendProduct for the mapping being edited
	const editingProduct: FrontendProduct | null = useMemo(() => {
		if (!editingMapping || !products) return null;

		const subMappings = mappings[editingMapping.subscriptionId];
		if (!subMappings) return null;

		const mapping = subMappings[editingMapping.mappingIndex];
		if (!mapping?.plan_id) return null;

		const productV2 = products.find((p) => p.id === mapping.plan_id);
		if (!productV2) return null;

		const baseProduct = productV2ToFrontendProduct({ product: productV2 });

		if (!mapping.items) return baseProduct;

		return getProductWithSupportedPlanFormValues({
			baseProduct,
			formValues: {
				items: mapping.items,
				version: undefined,
				trialLength: null,
				trialDuration: FreeTrialDuration.Day,
				trialEnabled: false,
				trialCardRequired: false,
			},
		});
	}, [editingMapping, mappings, products]);

	const handleEditItems = useCallback(
		({
			subscriptionId,
			mappingIndex,
		}: {
			subscriptionId: string;
			mappingIndex: number;
		}) => {
			setEditingMapping({ subscriptionId, mappingIndex });
			setIsInlineEditorOpen(true);
		},
		[setIsInlineEditorOpen],
	);

	const handlePlanEditorSave = useCallback(
		(draftProduct: FrontendProduct) => {
			if (!editingMapping || !products) {
				setEditingMapping(null);
				return;
			}

			const subMappings = mappings[editingMapping.subscriptionId];
			const mapping = subMappings?.[editingMapping.mappingIndex];
			if (!mapping?.plan_id) {
				setEditingMapping(null);
				return;
			}

			const productV2 = products.find((p) => p.id === mapping.plan_id);
			if (!productV2) {
				setEditingMapping(null);
				return;
			}

			const baseProduct = productV2ToFrontendProduct({ product: productV2 });
			const patch = getSupportedPlanFormPatchFromDraftProduct({
				baseProduct,
				draftProduct,
			});

			const updatedMappings = [...subMappings];
			updatedMappings[editingMapping.mappingIndex] = {
				...mapping,
				items: patch.items ?? null,
			};

			setMappings((prev) => ({
				...prev,
				[editingMapping.subscriptionId]: updatedMappings,
			}));
			setEditingMapping(null);
			setIsInlineEditorOpen(false);
		},
		[editingMapping, mappings, products, setIsInlineEditorOpen],
	);

	const handlePlanEditorCancel = useCallback(() => {
		setEditingMapping(null);
		setIsInlineEditorOpen(false);
	}, [setIsInlineEditorOpen]);

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Sync from Stripe"
				description="Import Stripe subscriptions as Autumn customer products"
			/>

			<div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
				{isLoading && (
					<div className="flex items-center justify-center py-12">
						<SmallSpinner size={20} className="text-t3" />
					</div>
				)}

				{error && (
					<div className="text-sm text-red-500 py-4">
						Failed to load Stripe subscriptions.
					</div>
				)}

				{!isLoading && !error && proposals.length === 0 && (
					<div className="text-sm text-t3 py-8 text-center">
						No Stripe subscriptions found for this customer.
					</div>
				)}

				{!isLoading &&
					proposals.map((proposal) => (
						<SyncProposalCard
							key={proposal.stripe_subscription_id}
							proposal={proposal}
							products={products ?? []}
							mappings={mappings[proposal.stripe_subscription_id] ?? []}
							customerProducts={customerProducts}
							onMappingsChange={(updatedMappings) =>
								handleMappingsChange({
									subscriptionId: proposal.stripe_subscription_id,
									updatedMappings,
								})
							}
							onEditItems={(mappingIndex) =>
								handleEditItems({
									subscriptionId: proposal.stripe_subscription_id,
									mappingIndex,
								})
							}
							stripeContext={{
								env,
								stripeAccountId: stripeAccount?.id,
								isAdmin,
								masterStripeAccountId: masterStripeAccount?.id,
							}}
						/>
					))}

				{proposals.length > 0 && (
					<div className="flex items-center gap-2 pt-2">
						<Button
							variant="secondary"
							onClick={closeSheet}
							className="flex-1"
						>
							Cancel
						</Button>
						<Button
							onClick={handleSync}
							disabled={
								confirmedMappings.length === 0 || syncMutation.isPending
							}
							isLoading={syncMutation.isPending}
							className="flex-1"
						>
							Sync {confirmedMappings.length}{" "}
							{confirmedMappings.length === 1 ? "plan" : "plans"}
						</Button>
					</div>
				)}
			</div>

			{editingProduct && (
				<InlinePlanEditor
					product={editingProduct}
					onSave={handlePlanEditorSave}
					onCancel={handlePlanEditorCancel}
					isOpen={editingMapping !== null}
				/>
			)}
		</div>
	);
}
