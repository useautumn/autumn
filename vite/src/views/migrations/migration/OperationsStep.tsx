import type { MigrationFilter, Operations } from "@autumn/shared";
import { Button } from "@autumn/ui";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	InfoIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { OperationsForm } from "./operations/OperationsForm";
import { type StepId, StepIndicator } from "./StepIndicator";
import { hasValidOperations } from "./shared/operationUtils";
import type { useMigrationEditorForm } from "./useMigrationEditorForm";

type FormInstance = ReturnType<typeof useMigrationEditorForm>["form"];

function hasVersionOperation(operations: Operations): boolean {
	return (
		operations.customer?.some(
			(op) => op.type === "update_plan" && op.version !== undefined,
		) ?? false
	);
}

export function OperationsStep({
	form,
	operations,
	filter,
	noBillingChanges,
	step,
	onStepChange,
	onPrevious,
	onNext,
	saveError,
	headerActions,
}: {
	form: FormInstance;
	operations: Operations;
	filter: MigrationFilter;
	noBillingChanges: boolean;
	step: StepId;
	onStepChange: (step: StepId) => void;
	onPrevious: () => void;
	onNext: () => void;
	saveError: string | null;
	headerActions?: ReactNode;
}) {
	const canProceed = hasValidOperations(operations) && !saveError;

	return (
		<div className="flex flex-col gap-4">
			<StepIndicator step={step} onStepChange={onStepChange}>
				{headerActions}
				<Button variant="secondary" size="default" onClick={onPrevious}>
					<ArrowLeftIcon size={14} />
					Previous
				</Button>
				<Button
					variant="primary"
					size="default"
					onClick={onNext}
					disabled={!canProceed}
				>
					Next
					<ArrowRightIcon size={14} />
				</Button>
			</StepIndicator>
			<OperationsForm
				value={operations}
				filter={filter}
				onChange={(v) => form.setFieldValue("operations", v)}
				noBillingChanges={noBillingChanges}
				onNoBillingChangesChange={(v) =>
					form.setFieldValue("noBillingChanges", v)
				}
			/>
			{saveError && (
				<div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500">
					<WarningCircleIcon size={14} weight="fill" className="shrink-0" />
					<span>{saveError}</span>
				</div>
			)}
			{hasVersionOperation(operations) && (
				<div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-sm text-blue-500">
					<InfoIcon size={14} weight="fill" className="shrink-0" />
					<span>
						Version updates won't apply to customers with custom plans.
					</span>
				</div>
			)}
		</div>
	);
}
