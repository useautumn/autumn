import type {
	FrontendProduct,
	FullCustomer,
	FullCustomerSchedule,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import {
	CusProductStatus,
	findCustomerProductById,
	mapToProductItems,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
	CreateScheduleReviewContent,
	CreateScheduleSheetContent,
} from "@/components/forms/create-schedule/components/CreateScheduleSheetContent";
import {
	CreateScheduleFormProvider,
	useCreateScheduleFormContext,
} from "@/components/forms/create-schedule/context/CreateScheduleFormProvider";
import {
	type CreateScheduleForm,
	EMPTY_SCHEDULE_PLAN,
	type SchedulePlan,
} from "@/components/forms/create-schedule/createScheduleFormSchema";
import { useCustomerSchedules } from "@/components/forms/create-schedule/hooks/useCustomerSchedules";
import { GenerateCheckoutStageWithPreview } from "@/components/forms/shared/GenerateCheckoutStage";
import { SendInvoiceStageWithPreview } from "@/components/forms/shared/SendInvoiceStage";
import { getSupportedPlanFormPatchFromDraftProduct } from "@/components/forms/shared/utils/planCustomizationUtils";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { backendToDisplayQuantity } from "@/utils/billing/prepaidQuantityUtils";
import { useEnv } from "@/utils/envUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";

type MergedSchedulePhase = {
	starts_at: number;
	customer_product_ids: string[];
};

function hasSchedulePhaseBillingCycleReset({
	customer,
	phases,
	nowMs,
}: {
	customer: FullCustomer | undefined;
	phases: MergedSchedulePhase[];
	nowMs: number;
}) {
	return phases.some(
		(phase) =>
			phase.starts_at > nowMs &&
			phase.customer_product_ids.some((cpId) => {
				const cusProduct = findCustomerProductById({
					fullCustomer: customer,
					customerProductId: cpId,
				});
				return cusProduct?.billing_cycle_anchor_resets_at === phase.starts_at;
			}),
	);
}

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
	const customerHasBasePrice =
		prices.length === 0 ||
		customerItems.some((item) => !item.feature_id && item.price != null);
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
		// One schedule can span entities, so each plan carries its own scope.
		entityId: cusProduct.entity_id ?? null,
	};
}

/**
 * Schedules span scopes, so the sheet edits every schedule at once: phases that
 * start at the same instant collapse into one row of plans, each keeping its own
 * scope.
 */
function mergeSchedulePhases({
	schedules,
}: {
	schedules: FullCustomerSchedule[];
}): MergedSchedulePhase[] {
	const productIdsByStart = new Map<number, string[]>();

	for (const schedule of schedules) {
		for (const phase of schedule.phases) {
			const existing = productIdsByStart.get(phase.starts_at);
			if (existing) existing.push(...phase.customer_product_ids);
			else
				productIdsByStart.set(phase.starts_at, [...phase.customer_product_ids]);
		}
	}

	return [...productIdsByStart.entries()]
		.sort(([a], [b]) => a - b)
		.map(([starts_at, customer_product_ids]) => ({
			starts_at,
			customer_product_ids,
		}));
}

/** Every active plan, whatever its scope — each row carries its own. */
export function getActiveCustomerPlans({
	customer,
	products,
}: {
	customer: FullCustomer | undefined;
	products: ProductV2[];
}): SchedulePlan[] {
	return (
		customer?.customer_products
			.filter((cp) => cp.status === CusProductStatus.Active && !cp.canceled_at)
			.map((cp) => cusProductToPlan({ cusProduct: cp, products })) ?? []
	);
}

export function buildInitialValues({
	customer,
	schedules,
	products,
	nowMs = Date.now(),
}: {
	customer: FullCustomer | undefined;
	schedules: FullCustomerSchedule[];
	products: ProductV2[];
	nowMs?: number;
}): CreateScheduleForm {
	const scheduledPhases = mergeSchedulePhases({ schedules });
	// An id with no live customer product is a stale phase entry, not a plan the
	// user has yet to pick — skip it rather than seed a blank row.
	const persistedPhases = scheduledPhases
		.map((phase) => ({
			startsAt: phase.starts_at,
			persistedStartsAt: phase.starts_at,
			plans: phase.customer_product_ids.flatMap((cpId) => {
				const cusProduct = findCustomerProductById({
					fullCustomer: customer,
					customerProductId: cpId,
				});
				return cusProduct ? [cusProductToPlan({ cusProduct, products })] : [];
			}),
		}))
		.filter((phase) => phase.plans.length > 0);

	if (persistedPhases.length > 0) {
		return {
			phases: persistedPhases,
			unscheduledPlans: [],
			billingBehavior: null,
			resetBillingCycle: hasSchedulePhaseBillingCycleReset({
				customer,
				phases: scheduledPhases,
				nowMs,
			}),
			enablePlanImmediately: false,
		};
	}

	// A brand new schedule starts empty — existing plans are opt-in, via the
	// picker's "Copy existing plans" action.
	return {
		phases: [
			{
				startsAt: null,
				persistedStartsAt: undefined,
				plans: [{ ...EMPTY_SCHEDULE_PLAN }],
			},
		],
		unscheduledPlans: [],
		billingBehavior: null,
		resetBillingCycle: false,
		enablePlanImmediately: false,
	};
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
			stripeAccount={stripeAccount ?? undefined}
			env={env}
			onBack={() => setSheet({ type: "create-schedule-review" })}
		/>
	);
}

function ScheduleCheckoutContent() {
	const { form, formValues, isPending, handleCheckoutSubmit, previewQuery } =
		useCreateScheduleFormContext();
	const { setSheet } = useSheetStore();

	return (
		<GenerateCheckoutStageWithPreview
			previewQuery={previewQuery}
			isPending={isPending}
			onSubmit={handleCheckoutSubmit}
			onBack={() => setSheet({ type: "create-schedule-review" })}
			// create_schedule has no long_lived_checkout param.
			showLongLivedCheckout={false}
			enablePlanImmediately={formValues.enablePlanImmediately}
			onEnablePlanImmediatelyChange={(value) =>
				form.setFieldValue("enablePlanImmediately", value)
			}
		/>
	);
}

function CreateScheduleSheetBody() {
	const {
		products,
		editingPlan,
		editingPlanValue,
		handlePlanEditSave,
		setEditingPlan,
	} = useCreateScheduleFormContext();
	const sheetType = useSheetStore((s) => s.type);
	const { setIsInlineEditorOpen } = useCustomerContext();

	useEffect(() => {
		setIsInlineEditorOpen(!!editingPlan);
		return () => setIsInlineEditorOpen(false);
	}, [editingPlan, setIsInlineEditorOpen]);

	const planEditorProduct = useMemo(() => {
		const product = products.find((p) => p.id === editingPlanValue?.productId);
		if (!(editingPlanValue && product)) return undefined;
		return productV2ToFrontendProduct({
			product: {
				...product,
				items: editingPlanValue.items ?? product.items,
				version: editingPlanValue.version ?? product.version,
			},
		});
	}, [editingPlanValue, products]);

	const handleInlineSave = (draftProduct: FrontendProduct) => {
		if (!(editingPlanValue && planEditorProduct)) return setEditingPlan(null);

		const patch = getSupportedPlanFormPatchFromDraftProduct({
			baseProduct: planEditorProduct,
			draftProduct,
		});
		handlePlanEditSave({
			plan: {
				...editingPlanValue,
				...(patch.items !== undefined && {
					items: patch.items,
					isCustom: true,
				}),
				...("version" in patch && { version: patch.version }),
			},
		});
	};

	let StageContent = CreateScheduleSheetContent;
	if (sheetType === "create-schedule-send-invoice") {
		StageContent = ScheduleSendInvoiceContent;
	} else if (sheetType === "create-schedule-checkout") {
		StageContent = ScheduleCheckoutContent;
	} else if (sheetType === "create-schedule-review") {
		StageContent = CreateScheduleReviewContent;
	}

	return (
		<>
			<StageContent />
			{planEditorProduct && (
				<InlinePlanEditor
					product={planEditorProduct}
					onSave={handleInlineSave}
					onCancel={() => setEditingPlan(null)}
					isOpen={!!editingPlan}
				/>
			)}
		</>
	);
}

export function CreateScheduleSheet() {
	const { closeSheet } = useSheetStore();
	const { customer, testClockFrozenTimeMs } = useCusQuery({ schedule: true });
	const fullCustomer = customer as FullCustomer | undefined;

	const { products } = useProductsQuery();
	const schedules = useCustomerSchedules();

	const initialValues = useMemo(
		() =>
			buildInitialValues({
				customer: fullCustomer,
				schedules,
				products,
				nowMs: testClockFrozenTimeMs,
			}),
		[fullCustomer, schedules, products, testClockFrozenTimeMs],
	);

	const existingPlans = useMemo(
		() => getActiveCustomerPlans({ customer: fullCustomer, products }),
		[fullCustomer, products],
	);

	return (
		<CreateScheduleFormProvider
			customerId={customer?.id ?? customer?.internal_id ?? ""}
			initialValues={initialValues}
			existingPlans={existingPlans}
			nowMs={testClockFrozenTimeMs}
			onCheckoutRedirect={(checkoutUrl) => {
				navigator.clipboard.writeText(checkoutUrl);
				toast.success("Checkout URL copied to clipboard");
			}}
			onSuccess={closeSheet}
		>
			<CreateScheduleSheetBody />
		</CreateScheduleFormProvider>
	);
}
