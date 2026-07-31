import {
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportFieldSchema,
} from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import { toast } from "sonner";
import { z } from "zod/v4";
import {
	LayoutGroup,
	SheetFooter,
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
	const hasNoMatchingCustomers = totalCount === 0;

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
				<LayoutGroup>
					<div className="flex h-full flex-col overflow-hidden">
						<div className="flex flex-1 flex-col overflow-y-auto">
							<SheetHeader
								title="Export customers"
								description={
									hasFilters
										? `Exports the ${totalCount.toLocaleString()} customers matching your current search and filters.`
										: `Exports all ${totalCount.toLocaleString()} customers.`
								}
							/>

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
							</SheetSection>

							<SheetSection title="Recent exports" withSeparator={false}>
								<CustomerExportJobList
									customerExports={customerExports ?? []}
									isLoading={isLoading}
								/>
							</SheetSection>
						</div>

						{activeExport ? (
							<p className="mx-4 mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-500">
								An export is already {activeExport.status}. Wait for it to
								finish before starting another.
							</p>
						) : null}

						{hasNoMatchingCustomers ? (
							<p className="mx-4 mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-500">
								No customers match your current search and filters, so there is
								nothing to export.
							</p>
						) : null}

						<SheetFooter>
							<ShortcutButton
								variant="secondary"
								className="w-full"
								onClick={() => onOpenChange(false)}
								singleShortcut="escape"
							>
								Cancel
							</ShortcutButton>
							<form.Subscribe selector={(state) => state.canSubmit}>
								{(canSubmit) => (
									<ShortcutButton
										variant="primary"
										className="w-full"
										onClick={() => form.handleSubmit()}
										isLoading={createExport.isPending}
										disabled={
											!canSubmit ||
											Boolean(activeExport) ||
											hasNoMatchingCustomers
										}
										metaShortcut="enter"
									>
										Start export
									</ShortcutButton>
								)}
							</form.Subscribe>
						</SheetFooter>
					</div>
				</LayoutGroup>
			</SheetContent>
		</Sheet>
	);
}
