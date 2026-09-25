import { Button, InlineAction } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { CustomerStateUnscheduledPlans } from "@/components/forms/customer-state/components/CustomerStateUnscheduledPlans";
import { DisabledTooltipButton } from "@/components/forms/shared";
import { BillingFooter } from "@/components/forms/shared/BillingFooter";
import { BillingPromptToggle } from "@/components/forms/shared/generation/BillingPromptToggle";
import { getInvoiceButtonState } from "@/components/forms/shared/utils/invoiceButtonState";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { CreateScheduleAdvancedSection } from "./CreateScheduleAdvancedSection";
import { CreateScheduleGenerationBar } from "./CreateScheduleGenerationBar";
import { SetPlansReviewChanges } from "./review/SetPlansReviewChanges";
import { SchedulePhaseCard } from "./SchedulePhaseCard";
import { SchedulePreview } from "./SchedulePreview";

export function CreateScheduleSheetContent() {
	const { form, formValues } = useCreateScheduleFormContext();
	const { handleAddPhase } = useCustomerStateContext();
	const { closeSheet, setSheet } = useSheetStore();

	const canSubmit = useStore(form.store, (state) => state.canSubmit);
	const isDisabled = !canSubmit;
	const disabledReason = !canSubmit
		? "Please fill in all required fields"
		: null;

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title="Set Plans"
				description="Declare the customer's plans now and in future phases"
				action={<BillingPromptToggle />}
			/>

			<div className="flex-1 overflow-y-auto">
				<SheetSection withSeparator={false} className="pb-0">
					<CreateScheduleGenerationBar />
				</SheetSection>
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

				<SheetSection withSeparator={false}>
					<CustomerStateUnscheduledPlans />
				</SheetSection>
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
	if (!preview) return "Set Plans";
	if (preview.redirect_to_checkout) return "Generate Checkout URL";
	if (preview.total <= 0) return "Set Plans";
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
				description="Review plan changes before confirming"
				breadcrumbs={[
					{
						name: "Set Plans",
						sheet: "create-schedule",
					},
				]}
			/>

			<div className="flex-1 overflow-y-auto">
				<SetPlansReviewChanges />
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
