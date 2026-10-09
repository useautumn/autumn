import type { InvoicePaymentMethod } from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";

/** The org's allowed invoice payment methods; read from the active sandbox, which billing requests target. */
export const useOrgPaymentMethodTypes = (): InvoicePaymentMethod[] | null => {
	const { org } = useOrg({ skipSandbox: false });
	return org?.config?.allowed_payment_methods ?? null;
};
