import type {
	FullCustomer,
	FullCustomerSchedule,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { CusProductStatus, mapToProductItems } from "@autumn/shared";
import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	AttachFormProvider,
	AttachPlanSection,
	AttachProductSelection,
	useAttachFormContext,
} from "@/components/forms/attach-v2";
import {
	CreateScheduleReviewContent,
	CreateScheduleSheetContent,
} from "@/components/forms/create-schedule/components/CreateScheduleSheetContent";
import {
	CreateScheduleFormProvider,
	useCreateScheduleFormContext,
} from "@/components/forms/create-schedule/context/CreateScheduleFormProvider";
import type { SchedulePlan } from "@/components/forms/create-schedule/createScheduleFormSchema";
import {
	type CreateScheduleForm,
	EMPTY_SCHEDULE_PLAN,
} from "@/components/forms/create-schedule/createScheduleFormSchema";
import { SendInvoiceStageWithPreview } from "@/components/forms/shared/SendInvoiceStage";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { Button } from "@/components/v2/buttons/Button";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { backendToDisplayQuantity } from "@/utils/billing/prepaidQuantityUtils";
import { useEnv } from "@/utils/envUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";

function reconstructCustomItems({
	cusProduct,
	product,
}: {
	cusProduct: FullCustomer["customer_products"][number];
	product: ProductV2 | undefined;
}): ProductItem[] | null {
	const prices = cusProduct.customer_prices.map((cp) => cp.price);
	const entitlements = cusProduct.customer_entitlements.map(
		(ce) => ce.entitlement,
	);
	const features = cusProduct.customer_entitlements.map(
		(ce) => ce.entitlement.feature,
	);
	const customerItems = mapToProductItems({ prices, entitlements, features });
	const customerFeatureIds = new Set(
		customerItems.map((item) => item.feature_id).filter(Boolean),
	);
	const customerHasBasePrice = customerItems.some(
		(item) => !item.feature_id && item.price != null,
	);
	const missingProductItems =
		product?.items?.filter((item) => {
			if (!item.feature_id) return !customerHasBasePrice;
			return !customerFeatureIds.has(item.feature_id);
		}) ?? [];
	const items = [...customerItems, ...missingProductItems];
	return items.length > 0 ? items : null;
}

export function cusProductToPlan({
	cusProduct,
	products,
}: {
	cusProduct: FullCustomer["customer_products"][number];
	products: ProductV2[];
}) {
	const product = products.find((p) => p.id === cusProduct.product_id);
	const prepaidItems =
		product?.items?.filter(
			(item) => item.feature_id && item.usage_model === "prepaid",
		) ?? [];

	const prepaidOptions =
		prepaidItems.length > 0 && cusProduct.options?.length > 0
			? backendToDisplayQuantity({
					backendOptions: cusProduct.options,
					prepaidItems,
				})
			: {};

	const isCustom =
		cusProduct.is_custom ||
		cusProduct.customer_prices.some((cp) => cp.price.is_custom) ||
		cusProduct.customer_entitlements.some((ce) => ce.entitlement.is_custom);

	const items = isCustom
		? reconstructCustomItems({ cusProduct, product })
		: null;

	return {
		...EMPTY_SCHEDULE_PLAN,
		productId: cusProduct.product_id,
		prepaidOptions,
		items,
		isCustom,
	};
}

export function buildInitialValues({
	customer,
	schedule,
	products,
	entityId,
}: {
	customer: FullCustomer | undefined;
	schedule: FullCustomerSchedule | undefined;
	products: ProductV2[];
	entityId?: string;
}): CreateScheduleForm {
	if (schedule?.phases?.length) {
		return {
			phases: schedule.phases.map((phase) => ({
				startsAt: phase.starts_at,
				persistedStartsAt: phase.starts_at,
				plans: phase.customer_product_ids.map((cpId) => {
					const cusProduct = customer?.customer_products.find(
						(cp) => cp.id === cpId,
					);
					return cusProduct
						? cusProductToPlan({ cusProduct, products })
						: { ...EMPTY_SCHEDULE_PLAN };
				}),
			})),
		};
	}

	const activePlans =
		customer?.customer_products
			.filter((cp) => {
				if (cp.status !== CusProductStatus.Active || cp.canceled_at)
					return false;
				if (entityId) return cp.entity_id === entityId;
				return !cp.entity_id;
			})
			.map((cp) => cusProductToPlan({ cusProduct: cp, products })) ?? [];

	return {
		phases: [
			{
				startsAt: null,
				persistedStartsAt: undefined,
				plans:
					activePlans.length > 0 ? activePlans : [{ ...EMPTY_SCHEDULE_PLAN }],
			},
		],
	};
}

function ScheduleEditFooter({
	onCancel,
	onSave,
}: {
	onCancel: () => void;
	onSave: (plan: SchedulePlan) => void;
}) {
	const { formValues, hasCustomizations } = useAttachFormContext();

	const handleSaveToSchedule = () => {
		onSave({
			productId: formValues.productId,
			prepaidOptions: formValues.prepaidOptions,
			items: formValues.items,
			isCustom: formValues.isCustom || hasCustomizations,
			version: formValues.version,
		});
	};

	return (
		<SheetFooter>
			<Button variant="secondary" onClick={onCancel} className="w-full">
				Cancel
			</Button>
			<Button
				variant="primary"
				onClick={handleSaveToSchedule}
				disabled={!formValues.productId}
				className="w-full"
			>
				Save to Schedule
			</Button>
		</SheetFooter>
	);
}

function ScheduleEditSheetContent({
	onCancel,
	onSave,
}: {
	onCancel: () => void;
	onSave: (plan: SchedulePlan) => void;
}) {
	const {
		formValues,
		productWithFormItems,
		showPlanEditor,
		handlePlanEditorSave,
		handlePlanEditorCancel,
	} = useAttachFormContext();

	const hasProductSelected = !!formValues.productId;

	return (
		<LayoutGroup>
			<div className="flex flex-col h-full overflow-y-auto">
				<SheetHeader
					title="Configure Plan"
					description="Configure the plan for this schedule phase"
				/>

				<SheetSection withSeparator={false} className="pb-0">
					<AttachProductSelection />
				</SheetSection>

				{hasProductSelected ? (
					<motion.div
						initial="hidden"
						animate="visible"
						variants={STAGGER_CONTAINER}
						className="flex flex-col"
					>
						<motion.div variants={STAGGER_ITEM}>
							<AttachPlanSection />
						</motion.div>
						<motion.div variants={STAGGER_ITEM}>
							<ScheduleEditFooter onCancel={onCancel} onSave={onSave} />
						</motion.div>
					</motion.div>
				) : (
					<ScheduleEditFooter onCancel={onCancel} onSave={onSave} />
				)}

				{productWithFormItems && (
					<InlinePlanEditor
						product={productWithFormItems}
						onSave={handlePlanEditorSave}
						onCancel={handlePlanEditorCancel}
						isOpen={showPlanEditor}
					/>
				)}
			</div>
		</LayoutGroup>
	);
}

function ScheduleEditSheet({
	editingPlanValue,
	onCancel,
	onSave,
}: {
	editingPlanValue: SchedulePlan | null;
	onCancel: () => void;
	onSave: (plan: SchedulePlan) => void;
}) {
	const { customer } = useCusQuery();
	const { setIsInlineEditorOpen } = useCustomerContext();

	return (
		<AttachFormProvider
			customerId={customer?.id ?? customer?.internal_id ?? ""}
			entityId={undefined}
			initialProductId={editingPlanValue?.productId ?? undefined}
			initialSchedulePlan={editingPlanValue}
			disablePreview
			onPlanEditorOpen={() => setIsInlineEditorOpen(true)}
			onPlanEditorClose={() => setIsInlineEditorOpen(false)}
			onSuccess={onCancel}
		>
			<ScheduleEditSheetContent onCancel={onCancel} onSave={onSave} />
		</AttachFormProvider>
	);
}

function ScheduleSendInvoiceContent() {
	const { isPending, handleInvoiceSubmit, previewQuery } =
		useCreateScheduleFormContext();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const { setSheet } = useSheetStore();

	return (
		<SendInvoiceStageWithPreview
			previewQuery={previewQuery}
			isPending={isPending}
			onSubmit={handleInvoiceSubmit}
			stripeAccount={stripeAccount}
			env={env}
			onBack={() => setSheet({ type: "create-schedule-review" })}
		/>
	);
}

function CreateScheduleSheetBody() {
	const { editingPlan, editingPlanValue, handlePlanEditSave, setEditingPlan } =
		useCreateScheduleFormContext();
	const sheetType = useSheetStore((s) => s.type);

	if (editingPlan) {
		return (
			<ScheduleEditSheet
				editingPlanValue={editingPlanValue}
				onCancel={() => setEditingPlan(null)}
				onSave={(plan) => {
					handlePlanEditSave({ plan });
					setEditingPlan(null);
				}}
			/>
		);
	}

	if (sheetType === "create-schedule-send-invoice") {
		return <ScheduleSendInvoiceContent />;
	}

	if (sheetType === "create-schedule-review") {
		return <CreateScheduleReviewContent />;
	}

	return <CreateScheduleSheetContent />;
}

type EntityWithSchedule = FullCustomer["entities"][number] & {
	schedule?: FullCustomerSchedule;
};

export function getScheduleForScope({
	customer,
	entityId,
}: {
	customer: FullCustomer | undefined;
	entityId: string | undefined;
}): FullCustomerSchedule | undefined {
	if (!entityId) return customer?.schedule;
	const entity = (customer?.entities as EntityWithSchedule[] | undefined)?.find(
		(e) => e.id === entityId || e.internal_id === entityId,
	);
	return entity?.schedule;
}

export function CreateScheduleSheet() {
	const { closeSheet } = useSheetStore();
	const { customer, testClockFrozenTimeMs } = useCusQuery();
	const initialEntityId =
		new URLSearchParams(window.location.search).get("entity_id") ?? undefined;
	const [scopeEntityId, setScopeEntityId] = useState<string | undefined>(
		initialEntityId,
	);

	const { products } = useProductsQuery();

	const fullCustomer = customer as FullCustomer | undefined;
	const schedule = getScheduleForScope({
		customer: fullCustomer,
		entityId: scopeEntityId,
	});

	const initialValues = useMemo(
		() =>
			buildInitialValues({
				customer: fullCustomer,
				schedule,
				products,
				entityId: scopeEntityId,
			}),
		[fullCustomer, schedule, products, scopeEntityId],
	);

	// Only update the schedule ID portion of the key when the user explicitly
	// changes scope. Without this, the customer query invalidation after an
	// invoice mutation causes schedule?.id to change (undefined → real ID),
	// which remounts the form provider and resets SendInvoiceStage's local
	// completedInvoiceUrl state, bouncing the user back to the draft/finalize view.
	const previousScopeRef = useRef(scopeEntityId);
	const scheduleIdForKeyRef = useRef(schedule?.id ?? "new");

	if (previousScopeRef.current !== scopeEntityId) {
		previousScopeRef.current = scopeEntityId;
		scheduleIdForKeyRef.current = schedule?.id ?? "new";
	}

	const formKey = `${scopeEntityId ?? "customer"}-${scheduleIdForKeyRef.current}`;

	return (
		<CreateScheduleFormProvider
			key={formKey}
			customerId={customer?.id ?? customer?.internal_id ?? ""}
			entityId={scopeEntityId}
			initialValues={initialValues}
			nowMs={testClockFrozenTimeMs}
			onCheckoutRedirect={(checkoutUrl) => {
				navigator.clipboard.writeText(checkoutUrl);
				toast.success("Checkout URL copied to clipboard");
			}}
			onSuccess={closeSheet}
			onScopeChange={setScopeEntityId}
		>
			<CreateScheduleSheetBody />
		</CreateScheduleFormProvider>
	);
}
