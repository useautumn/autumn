import type { FullCustomer } from "@autumn/shared";
import { Button, Skeleton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AttachAdvancedSection,
	AttachFormProvider,
	AttachLicenseLossWarning,
	AttachMultiPlanSection,
	AttachPlanOptions,
	AttachPlanSection,
	AttachPreviewSection,
	AttachProductSelection,
	AttachUpdatesSection,
	useAttachFormContext,
} from "@/components/forms/attach-v2";
import { AttachFooterV3 } from "@/components/forms/attach-v2/components/AttachFooterV3";
import { isFutureStartDate } from "@/components/forms/attach-v2/utils/buildAttachPreviewTotals";
import {
	DisabledTooltipButton,
	PlanScopeToggleButton,
} from "@/components/forms/shared";
import {
	GenerateCheckoutStageWithPreview,
	SchedulePlanStageWithPreview,
} from "@/components/forms/shared/GenerateCheckoutStage";
import {
	PREVIEW_REVEAL_TRANSITION,
	PreviewLoadingSection,
} from "@/components/forms/shared/PreviewSection";
import { SendInvoiceStageWithPreview } from "@/components/forms/shared/SendInvoiceStage";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSheetScopeEntityId } from "@/hooks/useSheetScopeEntityId";
import { useEnv } from "@/utils/envUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { CreateEntity } from "@/views/customers2/customer/components/CreateEntity";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { EntityScopeSelector } from "./EntityScopeSelector";

function ReviewPreviewBlock() {
	const { previewQuery, formValues, additionalPlans } = useAttachFormContext();
	const {
		data: previewData,
		error: queryError,
		isLoading: previewLoading,
	} = previewQuery;

	if (!formValues.productId) return null;

	// Hold the whole review block — updates, warnings and footer included —
	// behind the shimmer until there is a preview to show.
	if (!queryError && (previewLoading || !previewData)) {
		return <PreviewLoadingSection />;
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={PREVIEW_REVEAL_TRANSITION}
		>
			<AttachUpdatesSection />
			{!additionalPlans.isMultiPlan && <AttachLicenseLossWarning />}
			<AttachPreviewSection />
			<AttachFooterV3 />
		</motion.div>
	);
}

function PlanDiffSkeleton() {
	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-1">
				<Skeleton className="h-4 w-32 rounded-sm" />
				<div className="flex flex-col gap-2 mt-1">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="flex items-center h-10 px-3 rounded-xl input-base gap-2"
						>
							<div className="flex items-center gap-1 shrink-0">
								<Skeleton className="size-4 rounded-sm" />
								<Skeleton className="size-1 rounded-full" />
								<Skeleton className="size-4 rounded-sm" />
							</div>
							<Skeleton className="h-3.5 w-36 rounded-sm" />
						</div>
					))}
				</div>
			</div>
		</SheetSection>
	);
}

function SelectContent() {
	const { formValues, entityId, onScopeChange, additionalPlans } =
		useAttachFormContext();
	const { closeSheet, setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);
	const hasProductSelected = !!formValues.productId;
	const hasPendingPlan = formValues.additionalPlans.some(
		(plan) => !plan.productId,
	);
	let previewDisabledReason: string | null = null;
	if (hasPendingPlan) {
		previewDisabledReason = "Select a product for each row before previewing.";
	} else if (additionalPlans.hasInvalidPlanScopes) {
		previewDisabledReason =
			"Choose different scopes for plans in the same group or already active at this scope.";
	}

	const {
		hasEntities,
		entities,
		selectedEntity: fullEntity,
		isLoading: isEntitiesLoading,
		setSearch: setEntitySearch,
	} = useScopeEntitySearch({ selectedEntityId: entityId ?? undefined });

	const [createEntityOpen, setCreateEntityOpen] = useState(false);
	const [rootScopeOpen, setRootScopeOpen] = useState(false);
	const scopeSelector = hasEntities ? (
		<>
			<EntityScopeSelector
				entities={entities}
				scopeEntityId={entityId ?? undefined}
				onScopeChange={(value) => onScopeChange?.(value)}
				onSearchChange={setEntitySearch}
				isLoading={isEntitiesLoading}
				wrapInSection={false}
				showLabel={!additionalPlans.isMultiPlan}
				footer={({ close }) => (
					<div className="border-t py-1.5 px-2">
						<Button
							variant="muted"
							className="w-full"
							onClick={() => {
								close();
								setCreateEntityOpen(true);
							}}
						>
							<PlusIcon
								className="size-[14px] text-muted-foreground"
								weight="regular"
							/>
							Create new entity
						</Button>
					</div>
				)}
			/>

			{!additionalPlans.isMultiPlan &&
				(entityId ? (
					<div className="pt-2">
						<InfoBox variant="note">
							Attaching plan to entity{" "}
							<span className="font-semibold">
								{fullEntity?.name || fullEntity?.id}
							</span>
						</InfoBox>
					</div>
				) : (
					<div className="pt-2">
						<InfoBox variant="note">
							Attaching plan to customer - all entities will get access
						</InfoBox>
					</div>
				))}
		</>
	) : null;

	const rowScopePicker = hasEntities ? (
		<EntityScopeSelector
			entities={entities}
			isLoading={isEntitiesLoading}
			onOpenChange={setRootScopeOpen}
			onScopeChange={(value) => onScopeChange?.(value)}
			onSearchChange={setEntitySearch}
			open={rootScopeOpen}
			scopeEntityId={entityId ?? undefined}
			trigger={
				<PlanScopeToggleButton
					isEntityScoped={!!entityId}
					selectedLabel={
						entityId ? (fullEntity?.name ?? entityId) : "Customer-level"
					}
				/>
			}
		/>
	) : null;

	return (
		<>
			<SheetHeader
				title="Attach Product"
				description="Select and configure a product to attach to this customer"
			/>

			<SheetSection withSeparator={false} className="pb-0">
				<div className="space-y-2">
					<AttachProductSelection
						scope={
							additionalPlans.isMultiPlan && rowScopePicker
								? { picker: rowScopePicker }
								: undefined
						}
					/>
					{!additionalPlans.isMultiPlan && scopeSelector}
				</div>
			</SheetSection>

			{hasProductSelected && (
				<motion.div
					initial="hidden"
					animate="visible"
					variants={STAGGER_CONTAINER}
					className="flex flex-col"
				>
					{!additionalPlans.isMultiPlan && (
						<motion.div variants={STAGGER_ITEM}>
							<AttachPlanSection />
						</motion.div>
					)}
					<motion.div variants={STAGGER_ITEM}>
						<SheetSection withSeparator>
							<AttachPlanOptions />
						</SheetSection>
					</motion.div>
					<motion.div variants={STAGGER_ITEM}>
						<SheetFooter>
							<Button
								variant="secondary"
								onClick={closeSheet}
								className="w-full"
							>
								Cancel
							</Button>
							<DisabledTooltipButton
								variant="primary"
								onClick={() => setSheet({ type: "attach-review", itemId })}
								disabledReason={previewDisabledReason}
								tooltipClassName="max-w-72"
								className="w-full"
							>
								Preview Changes
							</DisabledTooltipButton>
						</SheetFooter>
					</motion.div>
				</motion.div>
			)}

			<CreateEntity open={createEntityOpen} setOpen={setCreateEntityOpen} />
		</>
	);
}

function ReviewContent() {
	const { product, previewDiff, additionalPlans } = useAttachFormContext();
	const itemId = useSheetStore((s) => s.itemId);
	let description = "Review configuration before confirming";
	if (product) description = `Attaching ${product.name} to this customer`;
	if (additionalPlans.isMultiPlan) {
		description = `Attaching ${additionalPlans.selectedPlanCount} plans to this customer`;
	}

	let planReview = <AttachPlanSection readOnly showDiff />;
	if (previewDiff.isDiffLoading) planReview = <PlanDiffSkeleton />;
	if (additionalPlans.isMultiPlan) planReview = <AttachMultiPlanSection />;

	return (
		<>
			<SheetHeader
				title="Review Changes"
				description={description}
				breadcrumbs={[{ name: "Attach Product", sheet: "attach-product" }]}
				itemId={itemId}
			/>

			{planReview}
			<AttachAdvancedSection />
			<ReviewPreviewBlock />
		</>
	);
}

function SendInvoiceContent() {
	const {
		form,
		product,
		previewQuery,
		isPending,
		handleInvoiceAttach,
		additionalPlans,
	} = useAttachFormContext();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);
	const startDate = useStore(form.store, (state) => state.values.startDate);
	const scheduledStartDate =
		!additionalPlans.isMultiPlan && isFutureStartDate(startDate)
			? startDate
			: null;

	return (
		<SendInvoiceStageWithPreview
			productName={product?.name}
			previewQuery={previewQuery}
			isPending={isPending}
			onSubmit={handleInvoiceAttach}
			stripeAccount={stripeAccount ?? undefined}
			env={env}
			onBack={() => setSheet({ type: "attach-review", itemId })}
			scheduledStartDate={scheduledStartDate}
		/>
	);
}

function CheckoutSessionContent() {
	const {
		form,
		formValues,
		product,
		previewQuery,
		isPending,
		handleCheckoutAttach,
		additionalPlans,
	} = useAttachFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	return (
		<GenerateCheckoutStageWithPreview
			productName={product?.name}
			previewQuery={previewQuery}
			isPending={isPending}
			onSubmit={handleCheckoutAttach}
			onBack={() => setSheet({ type: "attach-review", itemId })}
			showLongLivedCheckout={!additionalPlans.isMultiPlan}
			enablePlanImmediately={formValues.enablePlanImmediately}
			onEnablePlanImmediatelyChange={(value) =>
				form.setFieldValue("enablePlanImmediately", value)
			}
			longLivedCheckout={formValues.longLivedCheckout}
			onLongLivedCheckoutChange={(value) =>
				form.setFieldValue("longLivedCheckout", value)
			}
		/>
	);
}

function SchedulePlanContent() {
	const { form, product, formValues, previewQuery, isPending, handleConfirm } =
		useAttachFormContext();
	const { setSheet } = useSheetStore();
	const itemId = useSheetStore((s) => s.itemId);

	return (
		<SchedulePlanStageWithPreview
			productName={product?.name}
			startDate={formValues.startDate}
			previewQuery={previewQuery}
			isPending={isPending}
			onSubmit={handleConfirm}
			onBack={() => setSheet({ type: "attach-review", itemId })}
			enablePlanImmediately={formValues.enablePlanImmediately}
			onEnablePlanImmediatelyChange={(value) =>
				form.setFieldValue("enablePlanImmediately", value)
			}
		/>
	);
}

function SheetContent() {
	const sheetType = useSheetStore((s) => s.type);
	const {
		planEditorProduct,
		showPlanEditor,
		handlePlanEditorSave,
		handlePlanEditorCancel,
		formValues,
		additionalPlans,
	} = useAttachFormContext();

	let StageContent = SelectContent;
	if (sheetType === "attach-send-invoice") {
		StageContent = SendInvoiceContent;
	} else if (sheetType === "attach-checkout-session") {
		StageContent = CheckoutSessionContent;
	} else if (sheetType === "attach-schedule-plan") {
		StageContent = SchedulePlanContent;
	} else if (sheetType === "attach-review") {
		StageContent = ReviewContent;
	}

	return (
		<LayoutGroup>
			<div className="flex flex-col h-full overflow-y-auto">
				<StageContent />

				{planEditorProduct && (
					<InlinePlanEditor
						product={planEditorProduct}
						onSave={handlePlanEditorSave}
						onCancel={handlePlanEditorCancel}
						isOpen={showPlanEditor}
						enableLicenseEditing={!additionalPlans.isMultiPlan}
						initialAddLicenses={
							additionalPlans.isMultiPlan ? null : formValues.addLicenses
						}
					/>
				)}
			</div>
		</LayoutGroup>
	);
}

export function AttachProductSheet() {
	const itemId = useSheetStore((s) => s.itemId);
	const { closeSheet } = useSheetStore();
	const { customer } = useCusQuery();
	const { setIsInlineEditorOpen } = useCustomerContext();
	const [scopeEntityId, setScopeEntityId] = useSheetScopeEntityId(
		customer as FullCustomer | undefined,
	);

	return (
		<AttachFormProvider
			customerId={customer?.id ?? customer?.internal_id ?? ""}
			entityId={scopeEntityId}
			initialProductId={itemId ?? undefined}
			onPlanEditorOpen={() => setIsInlineEditorOpen(true)}
			onPlanEditorClose={() => setIsInlineEditorOpen(false)}
			onCheckoutRedirect={(checkoutUrl) => {
				navigator.clipboard.writeText(checkoutUrl);
				toast.success("Checkout URL copied to clipboard");
			}}
			onSuccess={closeSheet}
			onScopeChange={setScopeEntityId}
			allowMultiplePlans
		>
			<SheetContent />
		</AttachFormProvider>
	);
}
