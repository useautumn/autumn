import type { MigrationFilter } from "@autumn/shared";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { CustomerPreview, useCustomerCount } from "./filters/CustomerPreview";
import { FilterForm } from "./filters/FilterForm";
import { type StepId, StepIndicator } from "./StepIndicator";
import type { useMigrationEditorForm } from "./useMigrationEditorForm";

type FormInstance = ReturnType<typeof useMigrationEditorForm>["form"];

export function FilterStep({
	form,
	filter,
	step,
	onStepChange,
	onNext,
}: {
	form: FormInstance;
	filter: MigrationFilter;
	step: StepId;
	onStepChange: (step: StepId) => void;
	onNext: () => void;
}) {
	const customerCount = useCustomerCount(filter.customer ?? {});
	const hasCustomers = customerCount !== null && customerCount > 0;

	return (
		<div className="flex flex-col gap-4">
			<StepIndicator step={step} onStepChange={onStepChange}>
				<Button
					variant="primary"
					size="default"
					onClick={onNext}
					disabled={!hasCustomers}
				>
					{hasCustomers ? `Next (${customerCount})` : "Next"}
					<ArrowRightIcon size={14} />
				</Button>
			</StepIndicator>
			<FilterForm
				value={filter}
				onChange={(v) => form.setFieldValue("filter", v)}
			/>
			<CustomerPreview filter={filter.customer ?? {}} />
		</div>
	);
}
