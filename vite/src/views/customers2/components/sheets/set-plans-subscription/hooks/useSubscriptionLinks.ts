import type { FullCustomer } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SubscriptionLinks } from "@/components/forms/customer-state/types/subscriptionLinks";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useSyncProposalsV2QueryOptions } from "@/views/customers2/components/sync-stripe-v2/hooks/useSyncProposalsV2";
import { STRIPE_STATUS_INDICATORS } from "@/views/customers2/components/sync-stripe-v2/StripeStatusBadge";
import {
	buildSubscriptionPickerRows,
	subscriptionPickerRowDetails,
} from "../utils/buildSubscriptionPickerRows";

/** Lets the Set Plans form describe and open the customer's other subscriptions,
 * from the same Stripe data the picker already loaded. */
export const useSubscriptionLinks = ({
	enabled,
}: {
	enabled: boolean;
}): SubscriptionLinks | null => {
	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | undefined;
	const setSheet = useSheetStore((state) => state.setSheet);
	const queryOptions = useSyncProposalsV2QueryOptions({
		customerId: fullCustomer?.id ?? "",
	});
	const { data } = useQuery({
		...queryOptions,
		enabled: enabled && Boolean(fullCustomer?.id),
		refetchOnWindowFocus: false,
	});

	return useMemo(() => {
		if (!enabled) return null;
		const rows = buildSubscriptionPickerRows({
			proposals: data?.proposals,
			customerProducts: fullCustomer?.customer_products ?? [],
			entities: fullCustomer?.entities ?? [],
		});
		return {
			describe: (stripeSubscriptionId) => {
				const row = rows.find(({ key }) => key === stripeSubscriptionId);
				if (!row) return null;
				const status = row.stripe?.status;
				return {
					details: subscriptionPickerRowDetails({ row }),
					status: status
						? { label: status.label, ...STRIPE_STATUS_INDICATORS[status.tone] }
						: null,
				};
			},
			open: (stripeSubscriptionId) =>
				setSheet({
					type: "create-schedule-choose-subscription",
					data: { openKey: stripeSubscriptionId },
				}),
			pick: () => setSheet({ type: "create-schedule-choose-subscription" }),
		};
	}, [enabled, data, fullCustomer, setSheet]);
};
