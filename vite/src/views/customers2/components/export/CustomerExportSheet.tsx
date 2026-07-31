import {
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportFieldSchema,
} from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import { useEffect, useState } from "react";
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
	useUnfilteredCustomerCountQuery,
} from "../../hooks/useCustomerExports";
import { CustomerExportFieldSelector } from "./CustomerExportFieldSelector";
import { CustomerExportFilterScope } from "./CustomerExportFilterScope";
import { CustomerExportJobList } from "./CustomerExportJobList";

const CustomerExportFormSchema = z.object({
	fields: z
		.array(CustomerExportFieldSchema)
		.min(1, "Select at least one column."),
});

function buildExportDescription({
	isFilteredExport,
	filteredCount,
	exportTotalCount,
}: {
	isFilteredExport: boolean;
	filteredCount: number;
	exportTotalCount: number | undefined;
}) {
	if (isFilteredExport) {
		return `Exports the ${filteredCount.toLocaleString()} customers matching your current search and filters.`;
	}
	if (exportTotalCount === undefined) return "Exports all customers.";
	return `Exports all ${exportTotalCount.toLocaleString()} customers.`;
}

export function CustomerExportSheet({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { queryStates } = useCustomerFilters();
	const { totalCount, isLoading: isFilteredCountLoading } = useCusSearchQuery();
	const createExport = useCreateCustomerExport();
	const { data: customerExports, isLoading } = useCustomerExportsQuery({
		enabled: open,
	});

	const [restrictToCurrentFilters, setRestrictToCurrentFilters] =
		useState(true);

	// The sheet stays mounted while closed; a stale "export everyone" choice must
	// not survive into a later session with different filters.
	useEffect(() => {
		if (open) setRestrictToCurrentFilters(true);
	}, [open]);

	const trimmedSearch = queryStates.q.trim();
	const hasActiveFilters = hasActiveCustomerFilters(queryStates);
	const hasFilters = hasActiveFilters || Boolean(trimmedSearch);
	const isFilteredExport = hasFilters && restrictToCurrentFilters;
	const activeExport = (customerExports ?? []).find(isCustomerExportActive);

	const { data: unfilteredTotalCount } = useUnfilteredCustomerCountQuery({
		enabled: open && hasFilters,
	});

	const ignoresActiveFilters = hasFilters && !restrictToCurrentFilters;
	const exportTotalCount = ignoresActiveFilters
		? unfilteredTotalCount
		: totalCount;
	// An unresolved count must not read as "no customers to export".
	const exportCountReady = ignoresActiveFilters
		? unfilteredTotalCount !== undefined
		: !isFilteredCountLoading;
	const hasNothingToExport = exportCountReady && exportTotalCount === 0;

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
					search: isFilteredExport ? trimmedSearch : "",
					filters: isFilteredExport
						? buildCustomerFilterPayload(queryStates)
						: {},
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
								description={buildExportDescription({
									isFilteredExport,
									filteredCount: totalCount,
									exportTotalCount,
								})}
							/>

							{hasFilters ? (
								<SheetSection>
									<CustomerExportFilterScope
										searchText={trimmedSearch}
										hasActiveFilters={hasActiveFilters}
										restrictToCurrentFilters={restrictToCurrentFilters}
										onRestrictToCurrentFiltersChange={
											setRestrictToCurrentFilters
										}
									/>
								</SheetSection>
							) : null}

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

						{hasNothingToExport ? (
							<p className="mx-4 mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-500">
								{isFilteredExport
									? "No customers match your current search and filters. Untick the option above to export everyone."
									: "There are no customers to export."}
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
											!canSubmit || Boolean(activeExport) || hasNothingToExport
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
