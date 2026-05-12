import type { Migration } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { FilterStep } from "./FilterStep";
import { MigrationLiveView } from "./live/MigrationLiveView";
import { OperationsStep } from "./OperationsStep";
import { type StepId, STEPS, StepIndicator } from "./StepIndicator";
import { useMigrationEditorForm } from "./useMigrationEditorForm";

const STEP_IDS = STEPS.map((s) => s.id);

export function MigrationEditor({ migration }: { migration: Migration }) {
	const [step, setStep] = useQueryState<StepId>(
		"step",
		parseAsStringLiteral(STEP_IDS).withDefault("filter"),
	);
	const { form } = useMigrationEditorForm({ migration });
	const filter = useStore(form.store, (s) => s.values.filter);
	const operations = useStore(form.store, (s) => s.values.operations);

	return (
		<div className="flex flex-col gap-6">
			<StepIndicator step={step} onStepChange={setStep} />

			{step === "filter" && (
				<FilterStep
					form={form}
					filter={filter}
					onNext={() => setStep("operations")}
				/>
			)}
			{step === "operations" && (
				<OperationsStep
					form={form}
					operations={operations}
					onPrevious={() => setStep("filter")}
					onNext={() => setStep("live")}
				/>
			)}
			{step === "live" && (
				<MigrationLiveView
					migrationId={migration.id}
					filter={filter}
					onPrevious={() => setStep("operations")}
				/>
			)}
		</div>
	);
}
