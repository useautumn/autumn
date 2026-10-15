import type { SyncProposalV2 } from "@autumn/shared";
import type { CustomerStateForm } from "@/components/forms/customer-state/customerStateSchema";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { customerStateToSyncParams } from "../customerStateToSyncParams";
import type { SyncOptions } from "../SyncOptionsTable";
import { usePreviewSyncV2 } from "./usePreviewSyncV2";

export const useSyncPreview = ({
	proposal,
	formValues,
	options,
}: {
	proposal: SyncProposalV2;
	formValues: CustomerStateForm;
	options: SyncOptions;
}) => {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { customer } = useCusQuery();

	const syncParams = customerStateToSyncParams({
		customerId: customer?.id ?? "",
		proposal,
		formValues,
		products,
		features,
		...options,
	});
	const { mismatches, isFetching } = usePreviewSyncV2({ params: syncParams });
	return {
		syncParams,
		previewMismatches: mismatches,
		isPreviewFetching: isFetching,
	};
};
