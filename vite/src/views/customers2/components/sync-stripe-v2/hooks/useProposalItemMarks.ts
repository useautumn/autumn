import type { SyncProposalV2 } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { customerStateToSyncParams } from "../customerStateToSyncParams";
import { stripeItemMark } from "../previewMismatches";
import { DEFAULT_SYNC_OPTIONS } from "../SyncOptionsTable";
import type { PhaseSection } from "../syncPhaseSections";
import { syncProposalToCustomerState } from "../syncProposalToCustomerState";
import { usePreviewSyncV2 } from "./usePreviewSyncV2";
import { useTodayMismatches } from "./useTodayMismatches";

export const useProposalItemMarks = ({
	proposal,
	section,
}: {
	proposal: SyncProposalV2;
	section: PhaseSection | undefined;
}) => {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { customer } = useCusQuery();
	const { entityId } = useCustomerContext();
	const todayMismatches = useTodayMismatches({ proposal });

	const params = customerStateToSyncParams({
		customerId: customer?.id ?? "",
		proposal,
		formValues: syncProposalToCustomerState({
			proposal,
			customerProducts: customer?.customer_products ?? [],
			entities: customer?.entities ?? [],
			contextEntityId: entityId,
			products,
			features,
		}),
		products,
		features,
		...DEFAULT_SYNC_OPTIONS,
	});
	const { mismatches: previewMismatches } = usePreviewSyncV2({ params });

	return (stripePriceId: string) =>
		section &&
		stripeItemMark({
			todayMismatches,
			previewMismatches,
			stripePriceId,
			startsAt: section.phase.starts_at,
		});
};
