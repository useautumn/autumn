import {
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportFieldsSchema,
} from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
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
	fields: CustomerExportFieldsSchema,
	restrictToCurrentFilters: z.boolean(),
});

function buildExportDescription({
	isFilteredExport,
	filteredCount,
	exportTotalCount,
}: {
	isFilteredExport: boolean;
	filteredCount: number | undefined;
	exportTotalCount: number | undefined;
}) {
	if (isFilteredExport) {
		if (filteredCount === undefined) {
			return "Exports customers matching your current search and filters.";
		}
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
	const trimmedSearch = queryStates.q.trim();
	const hasActiveFilters = hasActiveCustomerFilters(queryStates);
	const hasFilters = hasActiveFilters || Boolean(trimmedSearch);

	const form = useAppForm({
		defaultValues: {
			fields: [...CUSTOMER_EXPORT_FIELD_ORDER],
			restrictToCurrentFilters: true,
		},
		validators: {
			onChange: CustomerExportFormSchema,
			onSubmit: CustomerExportFormSchema,
		},
		onSubmit: async ({ value }) => {
			const isFilteredExport = hasFilters && value.restrictToCurrentFilters;

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
	const restrictToCurrentFilters = useStore(
		form.store,
		(state) => state.values.restrictToCurrentFilters,
	);
	const { data: customerExports, isLoading } = useCustomerExportsQuery({
		enabled: open,
	});
	const isFilteredExport = hasFilters && restrictToCurrentFilters;
	const activeExport = (customerExports ?? []).find(isCustomerExportActive);

	const { data: unfilteredTotalCount } = useUnfilteredCustomerCountQuery({
		enabled: open && hasFilters,
	});

	const ignoresActiveFilters = hasFilters && !restrictToCurrentFilters;
	const exportTotalCount = ignoresActiveFilters
		? unfilteredTotalCount
		: totalCount;
	const exportCountReady = ignoresActiveFilters
		? unfilteredTotalCount !== undefined
		: !isFilteredCountLoading;
	const hasNothingToExport = exportCountReady && exportTotalCount === 0;

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			form.setFieldValue("restrictToCurrentFilters", true);
		}
		onOpenChange(nextOpen);
	};

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden">
				<LayoutGroup>
					<div className="flex h-full flex-col overflow-hidden">
						<div className="flex flex-1 flex-col overflow-y-auto">
							<SheetHeader
								title="Export customers"
								description={buildExportDescription({
									isFilteredExport,
									filteredCount: isFilteredCountLoading
										? undefined
										: totalCount,
									exportTotalCount,
								})}
							/>

							{hasFilters ? (
								<SheetSection>
									<form.Field name="restrictToCurrentFilters">
										{(field) => (
											<CustomerExportFilterScope
												searchText={trimmedSearch}
												hasActiveFilters={hasActiveFilters}
												restrictToCurrentFilters={field.state.value}
												onRestrictToCurrentFiltersChange={field.handleChange}
											/>
										)}
									</form.Field>
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
								onClick={() => handleOpenChange(false)}
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
											hasNothingToExport ||
											!exportCountReady ||
											isLoading
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
