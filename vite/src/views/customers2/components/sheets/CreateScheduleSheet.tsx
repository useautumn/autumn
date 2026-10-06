import type {
	Entity,
	FullCusProduct,
	FullCustomer,
	FullCustomerSchedule,
	ProductV2,
} from "@autumn/shared";
import {
	ACTIVE_STATUSES,
	CusProductStatus,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	CreateScheduleReviewContent,
	CreateScheduleSheetContent,
} from "@/components/forms/create-schedule/components/CreateScheduleSheetContent";
import {
	CreateScheduleFormProvider,
	useCreateScheduleFormContext,
} from "@/components/forms/create-schedule/context/CreateScheduleFormProvider";
import type { SetPlansSubscriptionTarget } from "@/components/forms/create-schedule/types/setPlansSubscriptionTarget";
import {
	defaultScheduleTrialFormValues,
	findCatalogScheduleTrial,
	findCurrentScheduleTrial,
} from "@/components/forms/create-schedule/utils/scheduleFreeTrial";
import { CustomerStatePlanEditor } from "@/components/forms/customer-state/components/CustomerStatePlanEditor";
import {
	customerProductsToCustomerState,
	MAX_PHASE_START_DRIFT_MS,
	type PhaseStart,
} from "@/components/forms/customer-state/customerProductsToCustomerState";
import { customerProductToCustomerStatePlan } from "@/components/forms/customer-state/customerProductToCustomerStatePlan";
import {
	type CustomerStateForm,
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { scopeCustomerProducts } from "@/components/forms/customer-state/scopeCustomerProducts";
import { GenerateCheckoutStageWithPreview } from "@/components/forms/shared/GenerateCheckoutStage";
import { SendInvoiceStageWithPreview } from "@/components/forms/shared/SendInvoiceStage";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEnv } from "@/utils/envUtils";
import { useSettleApprovalOnApply } from "@/views/approvals/hooks/useSettleApprovalOnApply";
import { approvalSeedFromSheetData } from "@/views/approvals/utils/approvalSheetIntegration";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useSubscriptionLinks } from "@/views/customers2/components/sheets/set-plans-subscription/hooks/useSubscriptionLinks";

const subscriptionTargetFromSheetData = (
	sheetData: Record<string, unknown> | null,
): SetPlansSubscriptionTarget | null =>
	(sheetData?.subscriptionTarget as SetPlansSubscriptionTarget | undefined) ??
	null;

const isScheduledCustomerProduct = (customerProduct: FullCusProduct) =>
	customerProduct.status === CusProductStatus.Scheduled;

/** Stripe stores phase starts in whole seconds, so a reset matches its phase to the second. */
const resetsBillingCycleAt = ({
	customerProducts,
	startsAt,
}: {
	customerProducts: FullCusProduct[];
	startsAt: number;
}) =>
	customerProducts.some(
		(customerProduct) =>
			isScheduledCustomerProduct(customerProduct) &&
			customerProduct.billing_cycle_anchor_resets_at != null &&
			truncateMsToSecondPrecision(
				customerProduct.billing_cycle_anchor_resets_at,
			) === truncateMsToSecondPrecision(startsAt),
	);

/** The proration a later phase was saved with, from the schedule phase starting with it. */
const prorationBehaviorAt = ({
	schedules,
	startsAt,
}: {
	schedules: FullCustomerSchedule[];
	startsAt: number;
}) =>
	schedules
		.flatMap((schedule) => schedule.phases)
		.find(
			(phase) =>
				truncateMsToSecondPrecision(phase.starts_at) ===
				truncateMsToSecondPrecision(startsAt),
		)?.proration_behavior ?? null;

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

/** Built from the customer's plans alone, scoped the same way Sync from Stripe
 * scopes them; scheduled plans mean the customer is already on a schedule. */
export function buildInitialValues({
	customer,
	products,
	stripeSubscriptionId,
	stripeScheduleId,
	schedules = [],
	nowMs = Date.now(),
}: {
	customer: FullCustomer | undefined;
	products: ProductV2[];
	stripeSubscriptionId?: string | null;
	stripeScheduleId?: string | null;
	schedules?: FullCustomerSchedule[];
	nowMs?: number;
}): CustomerStateForm {
	const customerProducts = scopeCustomerProducts({
		customerProducts: customer?.customer_products ?? [],
		stripeSubscriptionId,
		stripeScheduleId,
	});
	const hasScheduledPlans = customerProducts.some(isScheduledCustomerProduct);
	const currentPhaseStart = hasScheduledPlans
		? findCurrentPhaseStart({ customerProducts })
		: undefined;

	const seededState = customerProductsToSetPlansState({
		customerProducts,
		entities: customer?.entities ?? [],
		products,
	});
	const phases = seededState.phases.map((phase, index) => {
		const persistedStartsAt =
			index === 0 ? currentPhaseStart : (phase.startsAt ?? undefined);
		const laterPhaseStartsAt = index > 0 ? phase.startsAt : null;
		const keepsCycleAnchor =
			laterPhaseStartsAt != null &&
			!resetsBillingCycleAt({ customerProducts, startsAt: laterPhaseStartsAt });
		return {
			...phase,
			startsAt: index === 0 ? (currentPhaseStart ?? null) : phase.startsAt,
			keepsCycleAnchor,
			prorationBehavior:
				laterPhaseStartsAt == null
					? null
					: prorationBehaviorAt({ schedules, startsAt: laterPhaseStartsAt }),
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
		resetBillingCycle: false,
		billingCycleAnchorMode: "now",
		billingCycleAnchorDate: null,
		endDate: null,
		enablePlanImmediately: false,
		...defaultScheduleTrialFormValues({
			currentTrial: findCurrentScheduleTrial({ customerProducts, nowMs }),
			catalogFreeTrial: findCatalogScheduleTrial({
				phases,
				products,
				customerProducts: customer?.customer_products ?? [],
			}),
		}),
		trialEdited: false,
	};
}

/** The live plans are today's phase; each scheduled start, and each scheduled
 * end of a live plan that isn't a cancellation, is its own later phase. */
function customerProductsToSetPlansState({
	customerProducts,
	entities,
	products,
}: {
	customerProducts: FullCusProduct[];
	entities: Entity[];
	products: ProductV2[];
}) {
	const scheduledStarts = customerProducts
		.filter(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Scheduled,
		)
		.map((customerProduct) => customerProduct.starts_at);
	const scheduledEnds = customerProducts.flatMap((customerProduct) =>
		ACTIVE_STATUSES.includes(customerProduct.status) &&
		customerProduct.ended_at != null &&
		!customerProduct.canceled_at &&
		!scheduledStarts.some(
			(startsAt) =>
				Math.abs(startsAt - (customerProduct.ended_at ?? 0)) <=
				MAX_PHASE_START_DRIFT_MS,
		)
			? [customerProduct.ended_at]
			: [],
	);
	const phaseStarts: PhaseStart[] = [
		"now",
		...[...new Set([...scheduledStarts, ...scheduledEnds])].sort(
			(a, b) => a - b,
		),
	];

	return customerProductsToCustomerState({
		customerProducts,
		phaseStarts,
		canUnschedule: phaseStarts.length > 1,
		entities,
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
	// Later stages replace the sheet data, so the target is read once on open.
	const [subscriptionTarget] = useState(() =>
		subscriptionTargetFromSheetData(sheetData),
	);
	const approvalSeed = approvalSeedFromSheetData(sheetData);
	const onApplied = useSettleApprovalOnApply();
	const { customer, schedules, testClockFrozenTimeMs, isLoading } = useCusQuery(
		{ schedule: true },
	);
	const fullCustomer = customer as FullCustomer | undefined;

	const { products } = useProductsQuery();
	const subscriptionLinks = useSubscriptionLinks({
		enabled: Boolean(subscriptionTarget),
	});

	const seedOverrides = approvalSeed?.defaultOverrides as
		| Partial<CustomerStateForm>
		| undefined;
	const initialValues = useMemo(() => {
		const base = buildInitialValues({
			customer: fullCustomer,
			products,
			stripeSubscriptionId: subscriptionTarget?.stripeSubscriptionId,
			stripeScheduleId: subscriptionTarget?.stripeScheduleId,
			schedules,
			nowMs: testClockFrozenTimeMs,
		});
		// An approval seed is the proposed schedule itself — it replaces the
		// customer's current schedule as the starting point.
		return seedOverrides?.phases ? { ...base, ...seedOverrides } : base;
	}, [
		fullCustomer,
		products,
		subscriptionTarget,
		seedOverrides,
		schedules,
		testClockFrozenTimeMs,
	]);

	const existingPlans = useMemo(
		() => getActiveCustomerPlans({ customer: fullCustomer, products }),
		[fullCustomer, products],
	);

	// The form seeds once, so it waits for the saved schedule's phase settings.
	if (isLoading) return null;

	return (
		<CreateScheduleFormProvider
			customerId={customer?.id ?? customer?.internal_id ?? ""}
			initialValues={initialValues}
			existingPlans={existingPlans}
			subscriptionTarget={subscriptionTarget}
			subscriptionLinks={subscriptionLinks}
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
