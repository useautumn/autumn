import type { MigrationFilter } from "@autumn/shared";
import { ArrowRightIcon, FunnelSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { CustomerPreview, useCustomerCount } from "./filters/CustomerPreview";
import { FilterForm } from "./filters/FilterForm";
import type { useMigrationEditorForm } from "./useMigrationEditorForm";

type FormInstance = ReturnType<typeof useMigrationEditorForm>["form"];

export function FilterStep({
	form,
	filter,
	onNext,
}: {
	form: FormInstance;
	filter: MigrationFilter;
	onNext: () => void;
}) {
	const customerCount = useCustomerCount(filter.customer ?? {});
	const hasCustomers = customerCount !== null && customerCount > 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div className="text-t2 text-md flex gap-2 items-center">
					<FunnelSimpleIcon size={16} weight="fill" className="text-subtle" />
					Filter
				</div>
				<Button
					variant="primary"
					size="default"
					onClick={onNext}
					disabled={!hasCustomers}
				>
					{hasCustomers ? `Next (${customerCount})` : "Next"}
					<ArrowRightIcon size={14} />
				</Button>
			</div>
			<FilterForm
				value={filter}
				onChange={(v) => form.setFieldValue("filter", v)}
			/>
			<CustomerPreview filter={filter.customer ?? {}} />
		</div>
	);
}
