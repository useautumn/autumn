import type { Migration } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { FilterStep } from "./FilterStep";
import { MigrationLiveView } from "./live/MigrationLiveView";
import { OperationsStep } from "./OperationsStep";
import { StepIndicator } from "./StepIndicator";
import { useMigrationEditorForm } from "./useMigrationEditorForm";

type Step = 1 | 2 | 3;

export function MigrationEditor({ migration }: { migration: Migration }) {
	const [step, setStep] = useState<Step>(1);
	const { form } = useMigrationEditorForm({ migration });
	const filter = useStore(form.store, (s) => s.values.filter);
	const operations = useStore(form.store, (s) => s.values.operations);

	return (
		<div className="flex flex-col gap-6">
			<StepIndicator step={step} onStepChange={setStep} />

			{step === 1 && (
				<FilterStep form={form} filter={filter} onNext={() => setStep(2)} />
			)}
			{step === 2 && (
				<OperationsStep
					form={form}
					operations={operations}
					onPrevious={() => setStep(1)}
					onNext={() => setStep(3)}
				/>
			)}
			{step === 3 && (
				<MigrationLiveView
					migrationId={migration.id}
					filter={filter}
					onPrevious={() => setStep(2)}
				/>
			)}
		</div>
	);
}
