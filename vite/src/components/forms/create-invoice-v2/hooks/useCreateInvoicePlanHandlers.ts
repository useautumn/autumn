import { useCallback, useMemo, useRef } from "react";
import type { ServicePeriod } from "../createInvoiceFormSchema";
import { EMPTY_INVOICE_PLAN, newInvoicePlan } from "../createInvoiceFormSchema";
import { copyExistingPlansIntoInvoice } from "../utils/copyExistingPlansIntoInvoice";
import type { InvoiceExistingPlan } from "../utils/customerStatePlanToInvoicePlan";
import { withPlanServicePeriod } from "../utils/servicePeriod";
import type { CreateInvoiceFormApi } from "./useCreateInvoiceForm";

/** Row edits for the plans tray. New rows take the last scope picked, else the page's entity. */
export function useCreateInvoicePlanHandlers({
	form,
	defaultEntityId,
	existingPlans,
}: {
	form: CreateInvoiceFormApi;
	defaultEntityId: string | null;
	existingPlans: InvoiceExistingPlan[];
}) {
	const lastSelectedEntityId = useRef(defaultEntityId);
	// The picker present at mount waits for the sheet; user-added ones open at once.
	const hasAddedPlan = useRef(false);

	const plansNow = useCallback(() => form.store.state.values.plans, [form]);

	const handleAddPlan = useCallback(() => {
		hasAddedPlan.current = true;
		form.setFieldValue("plans", [
			...plansNow(),
			newInvoicePlan({ entityId: lastSelectedEntityId.current }),
		]);
	}, [form, plansNow]);

	const handleRemovePlan = useCallback(
		({ planId }: { planId: string }) => {
			form.setFieldValue(
				"plans",
				plansNow().filter(({ _id }) => _id !== planId),
			);
		},
		[form, plansNow],
	);

	const handleSelectPlanScope = useCallback(
		({
			planIndex,
			entityId,
		}: {
			planIndex: number;
			entityId: string | null;
		}) => {
			lastSelectedEntityId.current = entityId;
			form.setFieldValue(`plans[${planIndex}].entityId`, entityId);
		},
		[form],
	);

	const handleSetPlanPeriod = useCallback(
		({
			planIndex,
			period,
		}: {
			planIndex: number;
			period: ServicePeriod | null;
		}) => {
			const plan = plansNow()[planIndex];
			if (!plan) return;
			form.setFieldValue(
				`plans[${planIndex}]`,
				withPlanServicePeriod({ plan, period }),
			);
		},
		[form, plansNow],
	);

	const handleSelectPlan = useCallback(
		({ planIndex, planId }: { planIndex: number; planId: string }) => {
			const plan = plansNow()[planIndex];
			if (!plan) return;
			form.setFieldValue(`plans[${planIndex}]`, {
				...EMPTY_INVOICE_PLAN,
				_id: plan._id,
				entityId: plan.entityId,
				planId,
			});
		},
		[form, plansNow],
	);

	const handleCopyExistingPlans = useCallback(
		({
			planIndex,
			entityId,
		}: {
			planIndex: number;
			entityId: string | null;
		}) => {
			const plans = copyExistingPlansIntoInvoice({
				plans: plansNow(),
				planIndex,
				entityId,
				existingPlans,
			});
			if (plans) form.setFieldValue("plans", plans);
		},
		[form, plansNow, existingPlans],
	);

	return useMemo(
		() => ({
			shouldOpenPickerImmediately: () => hasAddedPlan.current,
			handleAddPlan,
			handleRemovePlan,
			handleSelectPlanScope,
			handleSetPlanPeriod,
			handleSelectPlan,
			handleCopyExistingPlans,
		}),
		[
			handleAddPlan,
			handleRemovePlan,
			handleSelectPlanScope,
			handleSetPlanPeriod,
			handleSelectPlan,
			handleCopyExistingPlans,
		],
	);
}
