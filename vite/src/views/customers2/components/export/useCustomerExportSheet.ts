import {
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportFieldsSchema,
	isCustomerExportActive,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { useAppForm } from "@/hooks/form/form";
import { getBackendErr } from "@/utils/genUtils";
import { useCustomerCountQuery } from "@/views/customers/hooks/useCustomerCountQuery";
import {
	buildCustomerFilterPayload,
	hasActiveCustomerFilters,
	useCustomerFilters,
} from "@/views/customers/hooks/useCustomerFilters";
import {
	useCreateCustomerExport,
	useCustomerExportsQuery,
	useInvalidateCustomerExports,
} from "../../hooks/useCustomerExports";

const CustomerExportFormSchema = z.object({
	fields: CustomerExportFieldsSchema,
	restrictToCurrentFilters: z.boolean(),
});

export type CustomerExportSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

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

function getEmptyMessage({
	hasNothingToExport,
	isFilteredExport,
}: {
	hasNothingToExport: boolean;
	isFilteredExport: boolean;
}) {
	if (!hasNothingToExport) return undefined;
	if (isFilteredExport) {
		return "No customers match your current search and filters. Untick the option above to export everyone.";
	}
	return "There are no customers to export.";
}

export function useCustomerExportSheet({
	open,
	onOpenChange,
}: CustomerExportSheetProps) {
	const { queryStates, isInitialized } = useCustomerFilters();
	const createExport = useCreateCustomerExport();
	const invalidateExports = useInvalidateCustomerExports();
	const [isRealtimeDegraded, setIsRealtimeDegraded] = useState(false);
	const trimmedSearch = queryStates.q.trim();
	const filters = buildCustomerFilterPayload(queryStates);
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
			const restrictToFilters = hasFilters && value.restrictToCurrentFilters;

			try {
				await createExport.mutateAsync({
					fields: value.fields,
					search: restrictToFilters ? trimmedSearch : "",
					filters: restrictToFilters ? filters : {},
				});
				toast.success("Export started");
			} catch (error) {
				invalidateExports();
				toast.error(getBackendErr(error, "Failed to start export"));
			}
		},
	});
	const restrictToCurrentFilters = useStore(
		form.store,
		(state) => state.values.restrictToCurrentFilters,
	);
	const isFilteredExport = hasFilters && restrictToCurrentFilters;

	const exportsQuery = useCustomerExportsQuery({
		enabled: open,
		isRealtimeDegraded,
	});
	const customerExports = exportsQuery.data ?? [];
	const activeExport = customerExports.find(isCustomerExportActive);

	const filteredCountQuery = useCustomerCountQuery({
		search: trimmedSearch,
		filters,
		enabled: open && isInitialized,
	});
	const unfilteredCountQuery = useCustomerCountQuery({
		search: "",
		filters: {},
		enabled: open && isInitialized && hasFilters,
	});
	const ignoresActiveFilters = hasFilters && !restrictToCurrentFilters;
	const countQuery = ignoresActiveFilters
		? unfilteredCountQuery
		: filteredCountQuery;
	// Submitting before persisted filters restore would export the wrong scope.
	const isExportCountLoading =
		!isInitialized ||
		countQuery.isPending ||
		countQuery.isFetching ||
		countQuery.isPlaceholderData;
	const exportTotalCount =
		isExportCountLoading || countQuery.isError ? undefined : countQuery.data;
	const hasNothingToExport = exportTotalCount === 0;

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			form.reset();
			setIsRealtimeDegraded(false);
		}
		onOpenChange(nextOpen);
	};

	return {
		activeExport,
		createExport,
		customerExports,
		emptyMessage: getEmptyMessage({
			hasNothingToExport,
			isFilteredExport,
		}),
		exportDescription: buildExportDescription({
			isFilteredExport,
			exportTotalCount,
		}),
		form,
		handleOpenChange,
		hasActiveFilters,
		hasFilters,
		hasNothingToExport,
		invalidateExports,
		isExportCountErrored: countQuery.isError,
		isExportCountLoading,
		isExportsInitialError:
			exportsQuery.isError && exportsQuery.data === undefined,
		isExportsLoading: exportsQuery.isLoading,
		isExportsRetrying: exportsQuery.isFetching,
		isFilteredExport,
		refetchExports: exportsQuery.refetch,
		setIsRealtimeDegraded,
		trimmedSearch,
	};
}
