import {
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportFieldSchema,
} from "@autumn/shared";
import { Button, Sheet, SheetContent } from "@autumn/ui";
import { toast } from "sonner";
import { z } from "zod/v4";
import {
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useAppForm } from "@/hooks/form/form";
import { getBackendErr } from "@/utils/genUtils";
import { useCusSearchQuery } from "@/views/customers/hooks/useCusSearchQuery";
import {
	buildCustomerFilterPayload,
	hasActiveCustomerFilters,
	useCustomerFilters,
} from "@/views/customers/hooks/useCustomerFilters";
import {
	isCustomerExportActive,
	useCreateCustomerExport,
	useCustomerExportsQuery,
} from "../../hooks/useCustomerExports";
import { CustomerExportFieldSelector } from "./CustomerExportFieldSelector";
import { CustomerExportJobList } from "./CustomerExportJobList";

const CustomerExportFormSchema = z.object({
	fields: z
		.array(CustomerExportFieldSchema)
		.min(1, "Select at least one column."),
});

export function CustomerExportSheet({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { queryStates } = useCustomerFilters();
	const { totalCount } = useCusSearchQuery();
	const createExport = useCreateCustomerExport();
	const { data: customerExports, isLoading } = useCustomerExportsQuery({
		enabled: open,
	});

	const trimmedSearch = queryStates.q.trim();
	const hasFilters =
		hasActiveCustomerFilters(queryStates) || Boolean(trimmedSearch);
	const activeExport = (customerExports ?? []).find(isCustomerExportActive);

	const form = useAppForm({
		defaultValues: { fields: [...CUSTOMER_EXPORT_FIELD_ORDER] },
		validators: {
			onChange: CustomerExportFormSchema,
			onSubmit: CustomerExportFormSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				await createExport.mutateAsync({
					fields: value.fields,
					search: trimmedSearch,
					filters: buildCustomerFilterPayload(queryStates),
				});
				toast.success("Export started");
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to start export"));
			}
		},
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Export customers"
					description={
						hasFilters
							? `Exports the ${totalCount.toLocaleString()} customers matching your current search and filters.`
							: `Exports all ${totalCount.toLocaleString()} customers.`
					}
				/>

				<div className="flex flex-1 flex-col overflow-y-auto">
					<form
						onSubmit={(event) => {
							event.preventDefault();
							form.handleSubmit();
						}}
					>
						<SheetSection>
							<form.Field name="fields">
								{(field) => (
									<CustomerExportFieldSelector
										selectedFields={field.state.value}
										onChange={(fields) => field.handleChange(fields)}
										errorMessage={
											field.state.meta.errors.length > 0
												? (field.state.meta.errors[0]?.message ??
													"Select at least one column.")
												: undefined
										}
									/>
								)}
							</form.Field>

							{activeExport ? (
								<p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-tiny dark:text-amber-500">
									An export is already {activeExport.status}. Wait for it to
									finish before starting another.
								</p>
							) : null}

							<form.Subscribe selector={(state) => state.canSubmit}>
								{(canSubmit) => (
									<Button
										type="submit"
										variant="primary"
										className="mt-4 w-full"
										isLoading={createExport.isPending}
										disabled={!canSubmit || Boolean(activeExport)}
									>
										Start export
									</Button>
								)}
							</form.Subscribe>
						</SheetSection>
					</form>

					<SheetSection title="Recent exports" withSeparator={false}>
						<CustomerExportJobList
							customerExports={customerExports ?? []}
							isLoading={isLoading}
						/>
					</SheetSection>
				</div>
			</SheetContent>
		</Sheet>
	);
}
