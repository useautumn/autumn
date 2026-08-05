import {
	Button,
	InlineAction,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon, PlusIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { DisabledTooltipButton } from "@/components/forms/shared";
import { BillingFooter } from "@/components/forms/shared/BillingFooter";
import { getInvoiceButtonState } from "@/components/forms/shared/utils/invoiceButtonState";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { useHasSchedule } from "../hooks/useHasSchedule";
import { CreateScheduleAdvancedSection } from "./CreateScheduleAdvancedSection";
import { SchedulePhaseCard } from "./SchedulePhaseCard";
import { SchedulePreview } from "./SchedulePreview";
import { UnscheduledPlanRow } from "./UnscheduledPlanRow";

export function CreateScheduleSheetContent() {
	const { form, formValues, handleAddPhase, handleAddUnscheduledPlan } =
		useCreateScheduleFormContext();
	const { closeSheet, setSheet } = useSheetStore();
	const hasSchedule = useHasSchedule();

	const canSubmit = useStore(form.store, (state) => state.canSubmit);
	const isDisabled = !canSubmit;
	const disabledReason = !canSubmit
		? "Please fill in all required fields"
		: null;

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title={hasSchedule ? "Update Schedule" : "Create Schedule"}
				description="Set up billing phases that activate at specific times"
			/>

			<div className="flex-1 overflow-y-auto">
				<SheetSection title="Phases" withSeparator>
					<div className="space-y-4">
						{formValues.phases.map((_phase, phaseIndex) => (
							<SchedulePhaseCard
								key={`phase-${phaseIndex}`}
								phaseIndex={phaseIndex}
								hasConnector={phaseIndex < formValues.phases.length - 1}
							/>
						))}
					</div>

					<InlineAction
						icon={<PlusIcon size={11} />}
						onClick={handleAddPhase}
						className="mt-3"
					>
						Add phase
					</InlineAction>
				</SheetSection>

				{/* Updating a schedule can't attach new plans, so this is create-only. */}
				{!hasSchedule && (
					<SheetSection withSeparator={false}>
						{formValues.unscheduledPlans.length > 0 && (
							<div className="mb-1.5 flex items-center gap-1.5">
								<span className="text-xs text-subtle">Unscheduled plans</span>
								<Tooltip>
									<TooltipTrigger asChild>
										<InfoIcon
											size={13}
											className="shrink-0 text-subtle hover:text-muted-foreground transition-colors cursor-default"
										/>
									</TooltipTrigger>
									<TooltipContent>
										Billed with the first phase, then left alone — the schedule
										never expires or replaces these
									</TooltipContent>
								</Tooltip>
							</div>
						)}

						<div className="space-y-1.5">
							{formValues.unscheduledPlans.map((plan, planIndex) => (
								<UnscheduledPlanRow
									key={`unscheduled-${planIndex}-${plan.productId || "empty"}`}
									planIndex={planIndex}
								/>
							))}
						</div>

						<InlineAction
							icon={<PlusIcon size={11} />}
							onClick={handleAddUnscheduledPlan}
							className={
								formValues.unscheduledPlans.length > 0 ? "mt-1.5" : undefined
							}
						>
							Add unscheduled plan
						</InlineAction>
					</SheetSection>
				)}
			</div>

			<SheetFooter>
				<Button variant="secondary" onClick={closeSheet} className="w-full">
					Cancel
				</Button>
				<DisabledTooltipButton
					variant="primary"
					onClick={() => setSheet({ type: "create-schedule-review" })}
					disabled={isDisabled}
					disabledReason={disabledReason}
					className="w-full"
				>
					Preview Changes
				</DisabledTooltipButton>
			</SheetFooter>
		</div>
	);
}

function getConfirmLabel({
	preview,
}: {
	preview:
		| {
				redirect_to_checkout?: boolean;
				total: number;
		  }
		| null
		| undefined;
}): string {
	if (!preview) return "Create Schedule";
	if (preview.redirect_to_checkout) return "Generate Checkout URL";
	if (preview.total <= 0) return "Create Schedule";
	return "Charge Customer";
}

export function CreateScheduleReviewContent() {
	const {
		handleSubmit,
		handleInvoiceSubmit,
		isPending,
		isPreviewLoading,
		preview,
		error,
		createsRecurringSubscription,
	} = useCreateScheduleFormContext();
	const { setSheet } = useSheetStore();
	const hasSchedule = useHasSchedule();

	const confirmLabel = getConfirmLabel({ preview });

	const {
		isInvoiceOnlyStart,
		label: invoiceButtonLabel,
		zeroAmountReason: invoiceDisabledReason,
	} = getInvoiceButtonState({ preview, createsRecurringSubscription });

	const handleInvoiceButtonClick = () => {
		if (isInvoiceOnlyStart) {
			handleInvoiceSubmit({
				enableProductImmediately: true,
				finalizeInvoice: true,
			});
			return;
		}
		setSheet({ type: "create-schedule-send-invoice" });
	};

	const isDisabled = isPreviewLoading || !!error;

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Review Changes"
				description={
					hasSchedule
						? "Review schedule changes before confirming"
						: "Review schedule before confirming"
				}
				breadcrumbs={[
					{
						name: hasSchedule ? "Update Schedule" : "Create Schedule",
						sheet: "create-schedule",
					},
				]}
			/>

			<div className="flex-1 overflow-y-auto">
				<CreateScheduleAdvancedSection />
				<SchedulePreview />
			</div>

			<BillingFooter layout="stacked">
				<DisabledTooltipButton
					variant="secondary"
					className="w-full"
					disabled={isPending || isDisabled}
					disabledReason={invoiceDisabledReason}
					tooltipClassName="max-w-(--anchor-width)"
					isLoading={isInvoiceOnlyStart && isPending}
					onClick={handleInvoiceButtonClick}
				>
					{invoiceButtonLabel}
				</DisabledTooltipButton>
				<Button
					variant="primary"
					className="w-full"
					onClick={() => {
						if (preview?.redirect_to_checkout) {
							setSheet({ type: "create-schedule-checkout" });
							return;
						}
						handleSubmit();
					}}
					isLoading={isPending}
					disabled={isDisabled}
				>
					{confirmLabel}
				</Button>
			</BillingFooter>
		</div>
	);
}
