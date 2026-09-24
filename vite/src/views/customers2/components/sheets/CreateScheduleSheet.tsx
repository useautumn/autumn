import type {
	FullCustomer,
	FullCustomerSchedule,
	ProductV2,
} from "@autumn/shared";
import { CusProductStatus, findCustomerProductById } from "@autumn/shared";
import { useMemo } from "react";
import { toast } from "sonner";
import {
	CreateScheduleReviewContent,
	CreateScheduleSheetContent,
} from "@/components/forms/create-schedule/components/CreateScheduleSheetContent";
import {
	CreateScheduleFormProvider,
	useCreateScheduleFormContext,
} from "@/components/forms/create-schedule/context/CreateScheduleFormProvider";
import { useCustomerSchedules } from "@/components/forms/create-schedule/hooks/useCustomerSchedules";
import { CustomerStatePlanEditor } from "@/components/forms/customer-state/components/CustomerStatePlanEditor";
import { customerProductToCustomerStatePlan } from "@/components/forms/customer-state/customerProductToCustomerStatePlan";
import {
	type CustomerStateForm,
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { GenerateCheckoutStageWithPreview } from "@/components/forms/shared/GenerateCheckoutStage";
import { SendInvoiceStageWithPreview } from "@/components/forms/shared/SendInvoiceStage";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEnv } from "@/utils/envUtils";
import { useSettleApprovalOnApply } from "@/views/approvals/hooks/useSettleApprovalOnApply";
import { approvalSeedFromSheetData } from "@/views/approvals/utils/approvalSheetIntegration";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

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
}): CustomerStatePlan[] {
	return (
		customer?.customer_products
			.filter((cp) => cp.status === CusProductStatus.Active && !cp.canceled_at)
			.map((cp) =>
				customerProductToCustomerStatePlan({ cusProduct: cp, products }),
			) ?? []
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
}): CustomerStateForm {
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
				return cusProduct
					? [customerProductToCustomerStatePlan({ cusProduct, products })]
					: [];
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
				plans: [{ ...EMPTY_CUSTOMER_STATE_PLAN }],
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
	const sheetType = useSheetStore((s) => s.type);

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
			<CustomerStatePlanEditor />
		</>
	);
}

export function CreateScheduleSheet() {
	const { closeSheet } = useSheetStore();
	const sheetData = useSheetStore((s) => s.data);
	const approvalSeed = approvalSeedFromSheetData(sheetData);
	const onApplied = useSettleApprovalOnApply();
	const { customer, testClockFrozenTimeMs } = useCusQuery({ schedule: true });
	const fullCustomer = customer as FullCustomer | undefined;

	const { products } = useProductsQuery();
	const schedules = useCustomerSchedules();

	const seedOverrides = approvalSeed?.defaultOverrides as
		| Partial<CustomerStateForm>
		| undefined;
	const initialValues = useMemo(() => {
		const base = buildInitialValues({
			customer: fullCustomer,
			schedules,
			products,
			nowMs: testClockFrozenTimeMs,
		});
		// An approval seed is the proposed schedule itself — it replaces the
		// customer's current schedule as the starting point.
		return seedOverrides?.phases ? { ...base, ...seedOverrides } : base;
	}, [fullCustomer, schedules, products, testClockFrozenTimeMs, seedOverrides]);

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
			onApplied={onApplied}
			onSuccess={closeSheet}
		>
			<CreateScheduleSheetBody />
		</CreateScheduleFormProvider>
	);
}
