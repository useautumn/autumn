import type { Migration } from "@autumn/shared";
import { IconTooltipButton } from "@autumn/ui";
import { BracketsSquareIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { useMigrationRunsQuery } from "@/hooks/queries/useMigrationRunsQuery";
import { FilterStep } from "./FilterStep";
import { useCustomerCount } from "./filters/CustomerPreview";
import { useGuardedStepNavigation } from "./hooks/useGuardedStepNavigation";
import { MigrationLiveView } from "./live/MigrationLiveView";
import { useMigrationSheetStore } from "./live/useMigrationSheetStore";
import { OperationsStep } from "./OperationsStep";
import { MigrationObjectSheet } from "./MigrationObjectSheet";
import { STEPS, type StepId } from "./StepIndicator";
import {
	toOperationsPayload,
	useMigrationEditorForm,
} from "./useMigrationEditorForm";

const STEP_IDS = STEPS.map((s) => s.id);

export function MigrationEditor({ migration }: { migration: Migration }) {
	const [step, setStep] = useQueryState<StepId>(
		"step",
		parseAsStringLiteral(STEP_IDS).withDefault("filter"),
	);
	const { form, saveError, enableErrorDisplay } = useMigrationEditorForm({
		migration,
	});
	const filter = useStore(form.store, (s) => s.values.filter);
	const operations = useStore(form.store, (s) => s.values.operations);
	const noBillingChanges = useStore(
		form.store,
		(s) => s.values.noBillingChanges,
	);
	const customerCount = useCustomerCount(filter.customer ?? {});
	const hasCustomers = customerCount !== null && customerCount > 0;
	const { runs } = useMigrationRunsQuery({ migrationId: migration.id });
	const hasRuns = runs.length > 0;
	const [showObjectOpen, setShowObjectOpen] = useState(false);

	const setLiveFormState = useMigrationSheetStore((s) => s.setLiveFormState);
	useEffect(() => {
		setLiveFormState({ operations, noBillingChanges });
	}, [operations, noBillingChanges, setLiveFormState]);

	const guardedSetStep = useGuardedStepNavigation({
		step,
		hasCustomers,
		hasRuns,
		operations,
		saveError,
		enableErrorDisplay,
		setStep,
	});

	const migrationObject = useMemo(
		() => ({
			filter,
			operations: toOperationsPayload({ operations, filter }),
		}),
		[filter, operations],
	);

	const headerActions = (
		<>
			<MigrationObjectSheet
				open={showObjectOpen}
				onOpenChange={setShowObjectOpen}
				value={migrationObject}
			/>
			<IconTooltipButton
				tooltip="Show migration object"
				icon={<BracketsSquareIcon size={14} />}
				onClick={() => setShowObjectOpen(true)}
			/>
		</>
	);

	return (
		<div className="flex flex-col gap-4">
			{step === "filter" && (
				<FilterStep
					form={form}
					filter={filter}
					step={step}
					onStepChange={guardedSetStep}
					onNext={() => {
						guardedSetStep("operations");
					}}
					headerActions={headerActions}
				/>
			)}
			{step === "operations" && (
				<OperationsStep
					form={form}
					operations={operations}
					filter={filter}
					noBillingChanges={noBillingChanges}
					step={step}
					onStepChange={guardedSetStep}
					onPrevious={() => {
						setStep("filter");
					}}
					onNext={() => {
						guardedSetStep("live");
					}}
					saveError={saveError}
					headerActions={headerActions}
				/>
			)}
			{step === "live" && (
				<MigrationLiveView
					migrationId={migration.id}
					filter={filter}
					operations={operations}
					noBillingChanges={noBillingChanges}
					step={step}
					onStepChange={guardedSetStep}
					headerActions={headerActions}
				/>
			)}
		</div>
	);
}
