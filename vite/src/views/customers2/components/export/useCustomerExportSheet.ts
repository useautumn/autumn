import {
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportFieldsSchema,
	type CustomerExportResponse,
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
import { useCustomerExportRealtime } from "../../hooks/useCustomerExportRealtime";
import {
	useCreateCustomerExport,
	useCustomerExportsQuery,
	useInvalidateCustomerExports,
} from "../../hooks/useCustomerExports";
import { withLiveProgress } from "./withLiveProgress";

export const CUSTOMER_EXPORTS_PAGE_SIZE = 5;

const CustomerExportFormSchema = z.object({
	fields: CustomerExportFieldsSchema,
	restrictToCurrentFilters: z.boolean(),
});

export type CustomerExportSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

/** Single source of truth for why submit is blocked — drives both the
 * disabled state and the tooltip so they can never disagree. */
function getSubmitBlockedReason({
	activeExport,
	hasNothingToExport,
	isFilteredExport,
	isCountErrored,
}: {
	activeExport: CustomerExportResponse | undefined;
	hasNothingToExport: boolean;
	isFilteredExport: boolean;
	isCountErrored: boolean;
}) {
	if (activeExport) {
		return `An export is already ${activeExport.status}. Starting another one will be rejected until it finishes.`;
	}
	if (hasNothingToExport) {
		return isFilteredExport
			? "No customers match your current search and filters. Untick “Apply filters” to export everyone."
			: "There are no customers to export.";
	}
	if (isCountErrored) {
		return "Couldn’t load customer counts. Try reopening the sheet.";
	}
	return undefined;
}

export function useCustomerExportSheet({
	open,
	onOpenChange,
}: CustomerExportSheetProps) {
	const { queryStates, isInitialized } = useCustomerFilters();
	const createExport = useCreateCustomerExport();
	const invalidateExports = useInvalidateCustomerExports();
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

	const [page, setPage] = useState(1);
	const offset = (page - 1) * CUSTOMER_EXPORTS_PAGE_SIZE;

	const exportsQuery = useCustomerExportsQuery({
		enabled: open,
		limit: CUSTOMER_EXPORTS_PAGE_SIZE,
		offset,
	});
	const polledExports = exportsQuery.data?.exports ?? [];
	const totalExports = exportsQuery.data?.total ?? 0;

	// Newest first, so a running export is always on page 1 — keep that page
	// queried so footer progress survives paging away from it.
	const firstPageQuery = useCustomerExportsQuery({
		enabled: open && page > 1,
		limit: CUSTOMER_EXPORTS_PAGE_SIZE,
		offset: 0,
	});
	const polledActiveExport = (
		page > 1 ? (firstPageQuery.data?.exports ?? []) : polledExports
	).find(isCustomerExportActive);

	// One subscription for the sheet, so the footer bar and the table agree.
	const { progress } = useCustomerExportRealtime({
		customerExport: polledActiveExport,
		onComplete: invalidateExports,
	});

	const customerExports = withLiveProgress({
		customerExports: polledExports,
		activeExportId: polledActiveExport?.id,
		progress,
	});
	const activeExport = polledActiveExport
		? {
				...polledActiveExport,
				progress: progress ?? polledActiveExport.progress,
			}
		: undefined;

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
			setPage(1);
		}
		onOpenChange(nextOpen);
	};

	return {
		activeExport,
		createExport,
		customerExports,
		exportTotalCount,
		form,
		handleOpenChange,
		hasActiveFilters,
		hasFilters,
		isExportCountLoading,
		submitBlockedReason: getSubmitBlockedReason({
			activeExport,
			hasNothingToExport,
			isFilteredExport,
			isCountErrored: countQuery.isError,
		}),
		isExportsInitialError:
			exportsQuery.isError && exportsQuery.data === undefined,
		isExportsLoading: exportsQuery.isLoading,
		isExportsRetrying: exportsQuery.isFetching,
		isFilteredExport,
		refetchExports: exportsQuery.refetch,
		trimmedSearch,
		page,
		setPage,
		totalExports,
		totalPages: Math.max(
			1,
			Math.ceil(totalExports / CUSTOMER_EXPORTS_PAGE_SIZE),
		),
	};
}
