import type { Migration } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { FilterStep } from "./FilterStep";
import { MigrationLiveView } from "./live/MigrationLiveView";
import { OperationsStep } from "./OperationsStep";
import { STEPS, type StepId } from "./StepIndicator";
import { useMigrationEditorForm } from "./useMigrationEditorForm";

const STEP_IDS = STEPS.map((s) => s.id);

export function MigrationEditor({ migration }: { migration: Migration }) {
	const [step, setStep] = useQueryState<StepId>(
		"step",
		parseAsStringLiteral(STEP_IDS).withDefault("filter"),
	);
	const { form, saveError } = useMigrationEditorForm({ migration });
	const filter = useStore(form.store, (s) => s.values.filter);
	const operations = useStore(form.store, (s) => s.values.operations);

	return (
		<div className="flex flex-col gap-4">
			{step === "filter" && (
				<FilterStep
					form={form}
					filter={filter}
					step={step}
					onStepChange={setStep}
					onNext={() => setStep("operations")}
				/>
			)}
			{step === "operations" && (
				<OperationsStep
					form={form}
					operations={operations}
					step={step}
					onStepChange={setStep}
					onPrevious={() => setStep("filter")}
					onNext={() => setStep("live")}
					saveError={saveError}
				/>
			)}
			{step === "live" && (
				<MigrationLiveView
					migrationId={migration.id}
					filter={filter}
					step={step}
					onStepChange={setStep}
					onPrevious={() => setStep("operations")}
				/>
			)}
		</div>
	);
}
