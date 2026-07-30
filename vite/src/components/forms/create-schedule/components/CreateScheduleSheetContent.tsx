import {
	Button,
	InlineAction,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { PlanEntityScopeSelector } from "@/components/forms/shared";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { useHasSchedule } from "../hooks/useHasSchedule";
import { CreateScheduleAdvancedSection } from "./CreateScheduleAdvancedSection";
import { SchedulePhaseCard } from "./SchedulePhaseCard";
import { SchedulePreview } from "./SchedulePreview";

export function CreateScheduleSheetContent() {
	const { form, formValues, entityId, handleAddPhase, onScopeChange } =
		useCreateScheduleFormContext();
	const { closeSheet, setSheet } = useSheetStore();
	const hasSchedule = useHasSchedule({ entityId });
	const {
		hasEntities,
		entities,
		isLoading: isEntitiesLoading,
		setSearch: setEntitySearch,
	} = useScopeEntitySearch({ selectedEntityId: entityId });

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
				{hasEntities && (
					<SheetSection title="Scope" withSeparator>
						<PlanEntityScopeSelector
							entities={entities}
							value={entityId}
							onChange={(nextEntityId) => {
								const scopeEntityId = nextEntityId ?? undefined;
								if (scopeEntityId !== entityId) onScopeChange?.(scopeEntityId);
							}}
							showLabel={false}
							wrapInSection={false}
							onSearchChange={setEntitySearch}
							isLoading={isEntitiesLoading}
						/>
					</SheetSection>
				)}

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
			</div>

			<SheetFooter>
				<Button variant="secondary" onClick={closeSheet} className="w-full">
					Cancel
				</Button>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="w-full">
							<Button
								variant="primary"
								onClick={() => setSheet({ type: "create-schedule-review" })}
								disabled={isDisabled}
								className="w-full"
							>
								Preview Changes
							</Button>
						</span>
					</TooltipTrigger>
					{disabledReason && <TooltipContent>{disabledReason}</TooltipContent>}
				</Tooltip>
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
	if (preview.redirect_to_checkout) return "Copy Checkout URL";
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
		entityId,
		createsRecurringSubscription,
	} = useCreateScheduleFormContext();
	const { setSheet } = useSheetStore();
	const hasSchedule = useHasSchedule({ entityId });

	const confirmLabel = getConfirmLabel({ preview });

	const hasNothingToInvoice =
		!!preview && preview.total <= 0 && !createsRecurringSubscription;

	const invoiceDisabledReason = hasNothingToInvoice
		? "Cannot send an invoice for $0 amounts. Please confirm the change instead."
		: null;

	// Usage-only plans create a real recurring sub that bills at cycle end even
	// though nothing is due now; a subtotal means a $0 invoice is still generated,
	// so keep the invoice sheet for those and only start directly when nothing bills now.
	const willCreateZeroDollarInvoice = (preview?.subtotal ?? 0) > 0;

	const isInvoiceOnlyStart =
		!!preview &&
		preview.total <= 0 &&
		createsRecurringSubscription &&
		!willCreateZeroDollarInvoice;

	const invoiceButtonLabel = isInvoiceOnlyStart
		? "Start subscription in invoice mode"
		: "Send an Invoice";

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

			<SheetFooter className="flex flex-col grid-cols-1 mt-0">
				<div className="flex flex-col gap-2 w-full">
					<Tooltip>
						<TooltipTrigger asChild>
							<span
								className={cn(
									"flex w-full",
									invoiceDisabledReason && "cursor-not-allowed",
								)}
							>
								<Button
									variant="secondary"
									className={cn(
										"w-full",
										invoiceDisabledReason && "pointer-events-none opacity-50",
									)}
									disabled={!invoiceDisabledReason && (isPending || isDisabled)}
									isLoading={isInvoiceOnlyStart && isPending}
									onClick={handleInvoiceButtonClick}
								>
									{invoiceButtonLabel}
								</Button>
							</span>
						</TooltipTrigger>
						{invoiceDisabledReason && (
							<TooltipContent side="top" className="max-w-(--anchor-width)">
								{invoiceDisabledReason}
							</TooltipContent>
						)}
					</Tooltip>
					<Button
						variant="primary"
						className="w-full"
						onClick={() => handleSubmit()}
						isLoading={isPending}
						disabled={isDisabled}
					>
						{confirmLabel}
					</Button>
				</div>
			</SheetFooter>
		</div>
	);
}
