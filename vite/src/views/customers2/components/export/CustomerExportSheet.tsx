import {
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportFieldSchema,
} from "@autumn/shared";
import {
	Button,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@autumn/ui";
import { toast } from "sonner";
import { z } from "zod/v4";
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
			<SheetContent className="flex flex-col overflow-hidden bg-background sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>Export customers</SheetTitle>
					<SheetDescription>
						{hasFilters
							? `Exports the ${totalCount.toLocaleString()} customers matching your current search and filters.`
							: `Exports all ${totalCount.toLocaleString()} customers.`}
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							form.handleSubmit();
						}}
					>
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
							<p className="text-muted-foreground text-xs">
								An export is already {activeExport.status}. Wait for it to
								finish before starting another.
							</p>
						) : null}

						<form.Subscribe selector={(state) => state.canSubmit}>
							{(canSubmit) => (
								<Button
									type="submit"
									variant="primary"
									isLoading={createExport.isPending}
									disabled={!canSubmit || Boolean(activeExport)}
								>
									Start export
								</Button>
							)}
						</form.Subscribe>
					</form>

					<div className="flex flex-col gap-2">
						<span className="font-medium text-sm">Recent exports</span>
						<CustomerExportJobList
							customerExports={customerExports ?? []}
							isLoading={isLoading}
						/>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
