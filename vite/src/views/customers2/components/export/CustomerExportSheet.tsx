import {
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportFieldsSchema,
} from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { type ReactNode, useEffect, useState } from "react";
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
import { useCustomerCountQuery } from "@/views/customers/hooks/useCustomerCountQuery";
import {
	buildCustomerFilterPayload,
	hasActiveCustomerFilters,
	useCustomerFilters,
} from "@/views/customers/hooks/useCustomerFilters";
import {
	isCustomerExportActive,
	useCreateCustomerExport,
	useCustomerExportsQuery,
	useInvalidateCustomerExports,
} from "../../hooks/useCustomerExports";
import { CustomerExportFieldSelector } from "./CustomerExportFieldSelector";
import { CustomerExportFilterScope } from "./CustomerExportFilterScope";
import { LiveCustomerExportJobList } from "./LiveCustomerExportJobList";

const CustomerExportFormSchema = z.object({
	fields: CustomerExportFieldsSchema,
	restrictToCurrentFilters: z.boolean(),
});

function buildExportDescription({
	isFilteredExport,
	exportTotalCount,
}: {
	isFilteredExport: boolean;
	exportTotalCount: number | undefined;
}) {
	if (isFilteredExport) {
		if (exportTotalCount === undefined) {
			return "Exports customers matching your current search and filters.";
		}
		return `Exports the ${exportTotalCount.toLocaleString()} customers matching your current search and filters.`;
	}
	if (exportTotalCount === undefined) return "Exports all customers.";
	return `Exports all ${exportTotalCount.toLocaleString()} customers.`;
}

/** `output` carries an implicit status role, so late-appearing notices are announced. */
function SheetNotice({ children }: { children: ReactNode }) {
	return (
		<output className="mx-4 mt-2 block rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-500">
			{children}
		</output>
	);
}

export function CustomerExportSheet({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { queryStates } = useCustomerFilters();
	const createExport = useCreateCustomerExport();
	const invalidateExports = useInvalidateCustomerExports();
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
				// A 409 means the server found a genuinely active export the list has not caught up with.
				invalidateExports();
				toast.error(getBackendErr(error, "Failed to start export"));
			}
		},
	});
	const restrictToCurrentFilters = useStore(
		form.store,
		(state) => state.values.restrictToCurrentFilters,
	);
	const [isRealtimeDegraded, setIsRealtimeDegraded] = useState(false);
	const { data: customerExports, isLoading } = useCustomerExportsQuery({
		enabled: open,
		isRealtimeDegraded,
	});
	const isFilteredExport = hasFilters && restrictToCurrentFilters;
	const activeExport = (customerExports ?? []).find(isCustomerExportActive);

	const {
		data: filteredTotalCount,
		isLoading: isFilteredCountLoading,
		isError: isFilteredCountError,
	} = useCustomerCountQuery({
		search: trimmedSearch,
		filters: buildCustomerFilterPayload(queryStates),
		enabled: open,
	});
	const {
		data: unfilteredTotalCount,
		isLoading: isUnfilteredCountLoading,
		isError: isUnfilteredCountError,
	} = useCustomerCountQuery({
		search: "",
		filters: {},
		enabled: open && hasFilters,
	});

	const ignoresActiveFilters = hasFilters && !restrictToCurrentFilters;
	const isExportCountLoading = ignoresActiveFilters
		? isUnfilteredCountLoading
		: isFilteredCountLoading;
	const isExportCountErrored = ignoresActiveFilters
		? isUnfilteredCountError
		: isFilteredCountError;
	const hasExportCount = !(isExportCountLoading || isExportCountErrored);
	const scopedTotalCount = ignoresActiveFilters
		? unfilteredTotalCount
		: filteredTotalCount;
	// A failed count must not read as an empty one, so it stays undefined.
	const exportTotalCount = hasExportCount ? scopedTotalCount : undefined;
	const hasNothingToExport = exportTotalCount === 0;

	useEffect(() => {
		form.reset();
	}, [open, form]);

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
								<LiveCustomerExportJobList
									customerExports={customerExports ?? []}
									activeExport={activeExport}
									isLoading={isLoading}
									onExportComplete={invalidateExports}
									onRealtimeDegradedChange={setIsRealtimeDegraded}
								/>
							</SheetSection>
						</div>

						{activeExport ? (
							<SheetNotice>
								An export is already {activeExport.status}. Starting another one
								will be rejected until it finishes.
							</SheetNotice>
						) : null}

						{isExportCountErrored ? (
							<SheetNotice>
								Couldn&apos;t load customer counts. You can still start the
								export.
							</SheetNotice>
						) : null}

						{hasNothingToExport ? (
							<SheetNotice>
								{isFilteredExport
									? "No customers match your current search and filters. Untick the option above to export everyone."
									: "There are no customers to export."}
							</SheetNotice>
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
											hasNothingToExport ||
											isExportCountLoading ||
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
