import type { InvoicePaymentMethod } from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";

export const useOrgPaymentMethodTypes = (): InvoicePaymentMethod[] | null => {
	const { org } = useOrg({ skipSandbox: false });
	return org?.config?.allowed_payment_methods ?? null;
};
