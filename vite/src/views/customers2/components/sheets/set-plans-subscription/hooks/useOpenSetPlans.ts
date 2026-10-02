import type { FullCustomer } from "@autumn/shared";
import { useCallback } from "react";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { decideSetPlansEntry } from "../utils/decideSetPlansEntry";

/** Opens Set Plans, going through the subscription picker when the customer
 * has several linked Stripe subscriptions. */
export const useOpenSetPlans = () => {
	const setSheet = useSheetStore((state) => state.setSheet);
	const { customer } = useCusQuery();
	const { entityId } = useCustomerContext();

	return useCallback(() => {
		const entry = decideSetPlansEntry({
			customerProducts:
				(customer as FullCustomer | undefined)?.customer_products ?? [],
			entityId,
		});

		if (entry.kind === "choose_subscription") {
			setSheet({ type: "create-schedule-choose-subscription" });
			return;
		}
		setSheet({
			type: "create-schedule",
			data: entry.subscriptionTarget
				? { subscriptionTarget: entry.subscriptionTarget }
				: null,
		});
	}, [customer, entityId, setSheet]);
};
