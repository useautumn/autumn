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
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { useHasSchedule } from "../hooks/useHasSchedule";
import { SchedulePhaseCard } from "./SchedulePhaseCard";
import { SchedulePreview } from "./SchedulePreview";

const CUSTOMER_LEVEL_VALUE = "__customer__";

export function CreateScheduleSheetContent() {
	const {
		form,
		formValues,
		entityId,
		isExistingSchedule,
		handleAddPhase,
		handleSubmit,
		isPending,
		isPreviewLoading,
		error,
		onScopeChange,
	} = useCreateScheduleFormContext();
	const { closeSheet } = useSheetStore();
	const hasSchedule = useHasSchedule();
	const { customer } = useCusQuery();
	const entities = (customer as FullCustomer | null)?.entities ?? [];
	const isDirty = useStore(form.store, (state) => state.isDirty);

	const canSubmit = useStore(form.store, (state) => state.canSubmit);
	const isDisabled = !canSubmit || isPreviewLoading || !!error;
	const disabledReason = isPreviewLoading
		? "Loading preview..."
		: error
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
								if (isDirty && isExistingSchedule) {
									if (
										!window.confirm(
											"Switching scope will discard unsaved changes. Continue?",
										)
									)
										return;
								}
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
						{formValues.phases.map((phase, phaseIndex) => (
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

				<SchedulePreview />
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
								onClick={handleSubmit}
								isLoading={isPending}
								disabled={isDisabled}
								className="w-full"
							>
								{hasSchedule ? "Update Schedule" : "Create Schedule"}
							</Button>
						</span>
					</TooltipTrigger>
					{disabledReason && <TooltipContent>{disabledReason}</TooltipContent>}
				</Tooltip>
			</SheetFooter>
		</div>
	);
}
