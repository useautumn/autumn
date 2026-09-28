import type { SyncParamsV1, SyncProposalV2 } from "@autumn/shared";
import { Button, SmallSpinner } from "@autumn/ui";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { useCallback, useMemo, useState } from "react";
import { CustomerStateProvider } from "@/components/forms/customer-state/CustomerStateProvider";
import { CustomerStatePhasePlans } from "@/components/forms/customer-state/components/CustomerStatePhasePlans";
import { CustomerStatePlanEditor } from "@/components/forms/customer-state/components/CustomerStatePlanEditor";
import { CustomerStateUnscheduledPlans } from "@/components/forms/customer-state/components/CustomerStateUnscheduledPlans";
import { PlanTraySectionTitle } from "@/components/forms/customer-state/components/tray/PlanTraySectionTitle";
import type { PlanLocation } from "@/components/forms/customer-state/customerStateSchema";
import { useCustomerStateForm } from "@/components/forms/customer-state/useCustomerStateForm";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { customerStateToSyncParams } from "./customerStateToSyncParams";
import { usePreviewSyncV2 } from "./hooks/usePreviewSyncV2";
import { useTodayMismatches } from "./hooks/useTodayMismatches";
import { findMissingPlanPrices } from "./previewMismatches";
import { StripeSourceTable } from "./StripeSourceTable";
import {
	DEFAULT_SYNC_OPTIONS,
	type SyncOptions,
	SyncOptionsTable,
} from "./SyncOptionsTable";
import { buildPhaseSections, formatPhaseStart } from "./syncPhaseSections";
import { syncProposalToCustomerState } from "./syncProposalToCustomerState";

type SubscriptionEditorProps = {
	proposal: SyncProposalV2;
	customerId: string;
	onBack: () => void;
	onSubmit: (params: SyncParamsV1) => void;
	isSubmitting: boolean;
};

/** The draft is seeded once off the customer's saved plans, so wait for them. */
export function SubscriptionEditorView(props: SubscriptionEditorProps) {
	const { isLoading } = useCusQuery();
	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<SmallSpinner size={20} className="text-tertiary-foreground" />
			</div>
		);
	}
	return <SubscriptionEditor {...props} />;
}

function SubscriptionEditor({
	proposal,
	customerId,
	onBack,
	onSubmit,
	isSubmitting,
}: SubscriptionEditorProps) {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { customer } = useCusQuery();
	const { entityId } = useCustomerContext();

	const phaseSections = useMemo(
		() => buildPhaseSections({ proposal }),
		[proposal],
	);
	const isMultiPhase =
		(proposal.stripe_schedule?.phases.length ?? 0) > 1 &&
		phaseSections.length > 1;
	const isNotStartedSchedule =
		!proposal.stripe_subscription_id && Boolean(proposal.stripe_schedule_id);

	const [nowMs] = useState(Date.now);
	const [initialValues] = useState(() =>
		syncProposalToCustomerState({
			proposal,
			customerProducts: customer?.customer_products ?? [],
			entities: customer?.entities ?? [],
			contextEntityId: entityId,
			products,
			features,
		}),
	);
	const form = useCustomerStateForm({ initialValues });
	const formValues = useStore(form.store, (state) => state.values);
	const [options, setOptions] = useState<SyncOptions>(DEFAULT_SYNC_OPTIONS);

	const syncParams = customerStateToSyncParams({
		customerId,
		proposal,
		formValues,
		products,
		features,
		...options,
	});
	const { mismatches: previewMismatches } = usePreviewSyncV2({
		params: syncParams,
	});
	const todayMismatches = useTodayMismatches({ proposal });

	const handlePlanNotFoundReasons = useCallback(
		(location: PlanLocation) => {
			const isUnscheduled = location.location === "unscheduled";
			const plan = isUnscheduled
				? formValues.unscheduledPlans[location.planIndex]
				: formValues.phases[location.phaseIndex]?.plans[location.planIndex];
			// Unscheduled plans bill alongside the first phase.
			const phase = proposal.phases[isUnscheduled ? 0 : location.phaseIndex];
			if (!plan?.productId || !phase) return [];
			return findMissingPlanPrices({
				previewMismatches,
				planId: plan.productId,
				startsAt: phase.starts_at,
			}).map(
				(mismatch) => mismatch.message ?? "No Stripe item bills this price",
			);
		},
		[formValues, proposal, previewMismatches],
	);

	const totalPlanInstances = [
		...(syncParams?.phases ?? []).flatMap((phase) => phase.plans),
		...(syncParams?.unscheduled_plans ?? []),
	].reduce((total, plan) => total + (plan.quantity ?? 1), 0);

	return (
		<CustomerStateProvider
			form={form}
			nowMs={nowMs}
			// Unscheduled plans ride on a live subscription across its phases.
			canMakeUnscheduled={
				isMultiPhase && Boolean(proposal.stripe_subscription_id)
			}
			planNotFoundReasons={handlePlanNotFoundReasons}
		>
			<div className="flex flex-1 flex-col overflow-hidden">
				<div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
					<button
						type="button"
						onClick={onBack}
						className="flex w-fit cursor-pointer items-center gap-1 text-xs text-tertiary-foreground hover:text-foreground"
					>
						<ArrowLeftIcon size={14} /> Back to subscriptions
					</button>

					<PlanTraySectionTitle
						title={
							isNotStartedSchedule ? "Stripe schedule" : "Stripe subscription"
						}
					/>
					<StripeSourceTable
						proposal={proposal}
						phaseSections={phaseSections}
						showPhases={isMultiPhase}
						todayMismatches={todayMismatches}
						previewMismatches={previewMismatches}
					/>

					<PlanTraySectionTitle title="Autumn plans" />
					<div className="flex flex-col gap-4">
						{phaseSections.map((section, phaseIndex) => (
							<CustomerStatePhasePlans
								key={`phase-${phaseIndex}-${section.phase.starts_at}`}
								phaseIndex={phaseIndex}
								header={
									isMultiPhase && (
										<PlanTraySectionTitle
											title={`Phase ${phaseIndex + 1}`}
											hint={formatPhaseStart(section.phase.starts_at)}
										/>
									)
								}
							/>
						))}
						<CustomerStateUnscheduledPlans />
					</div>

					<PlanTraySectionTitle title="Options" />
					<SyncOptionsTable
						options={options}
						onOptionsChange={setOptions}
						enablePlanImmediately={formValues.enablePlanImmediately}
						onEnablePlanImmediatelyChange={
							isNotStartedSchedule
								? (enabled) =>
										form.setFieldValue("enablePlanImmediately", enabled)
								: undefined
						}
					/>
				</div>

				<div className="flex items-center gap-2 border-t border-border px-4 pt-4 pb-4">
					<Button variant="secondary" onClick={onBack} className="flex-1">
						Cancel
					</Button>
					<Button
						onClick={() => syncParams && onSubmit(syncParams)}
						disabled={!syncParams || isSubmitting}
						isLoading={isSubmitting}
						className="flex-1"
					>
						Sync {totalPlanInstances}{" "}
						{totalPlanInstances === 1 ? "plan" : "plans"}
					</Button>
				</div>

				<CustomerStatePlanEditor />
			</div>
		</CustomerStateProvider>
	);
}
