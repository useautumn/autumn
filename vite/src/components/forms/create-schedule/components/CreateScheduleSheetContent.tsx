import type { FullCustomer } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { Button } from "@/components/v2/buttons/Button";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { useHasSchedule } from "../hooks/useHasSchedule";
import { CreateScheduleAdvancedSection } from "./CreateScheduleAdvancedSection";
import { SchedulePhaseCard } from "./SchedulePhaseCard";
import { SchedulePreview } from "./SchedulePreview";

const CUSTOMER_LEVEL_VALUE = "__customer__";

export function CreateScheduleSheetContent() {
	const { form, formValues, entityId, handleAddPhase, error, onScopeChange } =
		useCreateScheduleFormContext();
	const { closeSheet, setSheet } = useSheetStore();
	const hasSchedule = useHasSchedule();
	const { customer } = useCusQuery();
	const entities = (customer as FullCustomer | null)?.entities ?? [];

	const canSubmit = useStore(form.store, (state) => state.canSubmit);
	const isDisabled = !canSubmit || !!error;
	const disabledReason = error
		? error.message
		: !canSubmit
			? "Please fill in all required fields"
			: null;

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title={hasSchedule ? "Update Schedule" : "Create Schedule"}
				description="Set up billing phases that activate at specific times"
			/>

			<div className="flex-1 overflow-y-auto">
				{entities.length > 0 && (
					<SheetSection title="Scope" withSeparator>
						<SearchableSelect
							value={entityId ?? CUSTOMER_LEVEL_VALUE}
							onValueChange={(value) => {
								const newEntityId =
									value === CUSTOMER_LEVEL_VALUE ? undefined : value;
								if (newEntityId === entityId) return;
								onScopeChange?.(newEntityId);
							}}
							options={[
								{ id: CUSTOMER_LEVEL_VALUE, name: "Customer" },
								...entities,
							]}
							getOptionValue={(option: { id: string }) => option.id}
							getOptionLabel={(option: { id: string; name?: string | null }) =>
								option.name || option.id
							}
							placeholder="Select scope"
							searchable={entities.length > 5}
							searchPlaceholder="Search entities..."
							emptyText="No entities found"
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

					<button
						type="button"
						className="mt-3 flex items-center gap-1.5 text-xs text-t4 hover:text-t2 transition-colors py-1"
						onClick={handleAddPhase}
					>
						<PlusIcon size={11} />
						Add phase
					</button>
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
	const { handleSubmit, isPending, isPreviewLoading, preview, error } =
		useCreateScheduleFormContext();
	const { setSheet } = useSheetStore();
	const hasSchedule = useHasSchedule();

	const confirmLabel = getConfirmLabel({ preview });
	const isZeroAmount = preview && preview.total <= 0;

	const invoiceDisabledReason = isZeroAmount
		? "Cannot send an invoice for $0 amounts. Please confirm the change instead."
		: null;

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
									onClick={() =>
										setSheet({ type: "create-schedule-send-invoice" })
									}
								>
									Send an Invoice
								</Button>
							</span>
						</TooltipTrigger>
						{invoiceDisabledReason && (
							<TooltipContent
								side="top"
								className="max-w-(--radix-tooltip-trigger-width)"
							>
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
