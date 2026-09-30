import type { FullCusProduct, FullCustomer, ProductV2 } from "@autumn/shared";
import { ACTIVE_STATUSES, CusProductStatus } from "@autumn/shared";
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
import { CustomerStatePlanEditor } from "@/components/forms/customer-state/components/CustomerStatePlanEditor";
import {
	customerProductsToCustomerState,
	type PhaseStart,
} from "@/components/forms/customer-state/customerProductsToCustomerState";
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

const isScheduledCustomerProduct = (customerProduct: FullCusProduct) =>
	customerProduct.status === CusProductStatus.Scheduled;

/** A scheduled plan whose start also resets the billing cycle. */
const hasUpcomingBillingCycleReset = ({
	customerProducts,
	nowMs,
}: {
	customerProducts: FullCusProduct[];
	nowMs: number;
}) =>
	customerProducts.some(
		(customerProduct) =>
			isScheduledCustomerProduct(customerProduct) &&
			customerProduct.starts_at > nowMs &&
			customerProduct.billing_cycle_anchor_resets_at ===
				customerProduct.starts_at,
	);

/** When today's phase began: its earliest live plan that ends at a scheduled
 * phase. Ongoing plans aren't part of it, so their start doesn't count. */
const findCurrentPhaseStart = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): number | undefined => {
	const currentPhaseStarts = customerProducts
		.filter(
			(customerProduct) =>
				ACTIVE_STATUSES.includes(customerProduct.status) &&
				customerProduct.ended_at != null &&
				customerProduct.starts_at != null,
		)
		.map((customerProduct) => customerProduct.starts_at);
	return currentPhaseStarts.length > 0
		? Math.min(...currentPhaseStarts)
		: undefined;
};

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

/** Built from the customer's plans alone, the same way Sync from Stripe reads
 * them; scheduled plans mean the customer is already on a schedule. */
export function buildInitialValues({
	customer,
	products,
	nowMs = Date.now(),
}: {
	customer: FullCustomer | undefined;
	products: ProductV2[];
	nowMs?: number;
}): CustomerStateForm {
	const customerProducts = customer?.customer_products ?? [];
	const hasScheduledPlans = customerProducts.some(isScheduledCustomerProduct);
	const currentPhaseStart = hasScheduledPlans
		? findCurrentPhaseStart({ customerProducts })
		: undefined;

	const seededState = customerProductsToSetPlansState({ customer, products });
	const phases = seededState.phases.map((phase, index) => {
		const persistedStartsAt =
			index === 0 ? currentPhaseStart : (phase.startsAt ?? undefined);
		return {
			...phase,
			startsAt: index === 0 ? (currentPhaseStart ?? null) : phase.startsAt,
			...(hasScheduledPlans && persistedStartsAt != null
				? { persistedStartsAt }
				: {}),
			plans:
				phase.plans.length > 0
					? phase.plans
					: [{ ...EMPTY_CUSTOMER_STATE_PLAN }],
		};
	});

	return {
		phases,
		unscheduledPlans: seededState.unscheduledPlans,
		billingBehavior: null,
		resetBillingCycle: hasUpcomingBillingCycleReset({
			customerProducts,
			nowMs,
		}),
		billingCycleAnchorMode: "now",
		billingCycleAnchorDate: null,
		endDate: null,
		enablePlanImmediately: false,
	};
}

/** The live plans are today's phase and each scheduled start is its own later
 * phase. */
function customerProductsToSetPlansState({
	customer,
	products,
}: {
	customer: FullCustomer | undefined;
	products: ProductV2[];
}) {
	const customerProducts = customer?.customer_products ?? [];
	const scheduledStarts = customerProducts
		.filter(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Scheduled,
		)
		.map((customerProduct) => customerProduct.starts_at);
	const phaseStarts: PhaseStart[] = [
		"now",
		...[...new Set(scheduledStarts)].sort((a, b) => a - b),
	];

	return customerProductsToCustomerState({
		customerProducts,
		phaseStarts,
		canUnschedule: phaseStarts.length > 1,
		entities: customer?.entities ?? [],
		products,
	});
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
	const { customer, testClockFrozenTimeMs } = useCusQuery();
	const fullCustomer = customer as FullCustomer | undefined;

	const { products } = useProductsQuery();

	const seedOverrides = approvalSeed?.defaultOverrides as
		| Partial<CustomerStateForm>
		| undefined;
	const initialValues = useMemo(() => {
		const base = buildInitialValues({
			customer: fullCustomer,
			products,
			nowMs: testClockFrozenTimeMs,
		});
		// An approval seed is the proposed schedule itself — it replaces the
		// customer's current schedule as the starting point.
		return seedOverrides?.phases ? { ...base, ...seedOverrides } : base;
	}, [fullCustomer, products, testClockFrozenTimeMs, seedOverrides]);

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
