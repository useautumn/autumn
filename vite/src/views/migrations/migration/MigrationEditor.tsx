import type { Migration } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useEffect } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { FilterStep } from "./FilterStep";
import { useCustomerCount } from "./filters/CustomerPreview";
import { useGuardedStepNavigation } from "./hooks/useGuardedStepNavigation";
import { MigrationLiveView } from "./live/MigrationLiveView";
import { useMigrationSheetStore } from "./live/useMigrationSheetStore";
import { OperationsStep } from "./OperationsStep";
import { STEPS, type StepId } from "./StepIndicator";
import { useMigrationEditorForm } from "./useMigrationEditorForm";

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

	const setLiveFormState = useMigrationSheetStore((s) => s.setLiveFormState);
	useEffect(() => {
		setLiveFormState({ operations, noBillingChanges });
	}, [operations, noBillingChanges, setLiveFormState]);

	const guardedSetStep = useGuardedStepNavigation({
		step,
		hasCustomers,
		operations,
		saveError,
		enableErrorDisplay,
		setStep,
	});

	return (
		<div className="flex flex-col gap-4">
			{step === "filter" && (
				<FilterStep
					form={form}
					filter={filter}
					step={step}
					onStepChange={guardedSetStep}
					onNext={() => guardedSetStep("operations")}
				/>
			)}
			{step === "operations" && (
				<OperationsStep
					form={form}
					operations={operations}
					noBillingChanges={noBillingChanges}
					step={step}
					onStepChange={guardedSetStep}
					onPrevious={() => setStep("filter")}
					onNext={() => guardedSetStep("live")}
					saveError={saveError}
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
				/>
			)}
		</div>
	);
}
