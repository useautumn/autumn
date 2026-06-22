import type { CustomerFilter, MigrationFilter } from "@autumn/shared";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { CustomerPreview, useCustomerCount } from "./filters/CustomerPreview";
import { FilterForm } from "./filters/FilterForm";
import { type StepId, StepIndicator } from "./StepIndicator";
import type { useMigrationEditorForm } from "./useMigrationEditorForm";

type FormInstance = ReturnType<typeof useMigrationEditorForm>["form"];

export function hasActiveFilter(filter: CustomerFilter): boolean {
	if (filter.customer_id) return true;
	// Multi-condition filters compose quantifiers at the customer level.
	if (filter.$and?.length || filter.$or?.length) return true;
	if (!filter.plan) return false;
	const plan = filter.plan;
	if (typeof plan !== "object") return false;
	return Object.values(plan).some((v) => v !== undefined && v !== "");
}

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
	const customerFilter = filter.customer ?? {};
	const customerCount = useCustomerCount(customerFilter);
	const hasCustomers = customerCount !== null && customerCount > 0;
	const showPreview = hasActiveFilter(customerFilter);

	return (
		<div className="flex flex-col gap-4">
			<StepIndicator step={step} onStepChange={onStepChange}>
				<Button
					variant="primary"
					size="default"
					onClick={onNext}
					disabled={!hasCustomers}
				>
					{hasCustomers ? `Next (${customerCount.toLocaleString()})` : "Next"}
					<ArrowRightIcon size={14} />
				</Button>
			</StepIndicator>
			<FilterForm
				value={filter}
				onChange={(v) => form.setFieldValue("filter", v)}
			/>
			{showPreview && <CustomerPreview filter={customerFilter} />}
		</div>
	);
}
