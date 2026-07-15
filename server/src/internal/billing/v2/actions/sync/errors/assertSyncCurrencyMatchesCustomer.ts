import { ErrCode, RecaseError, type SyncBillingContext } from "@autumn/shared";
import { syncContextHasPaidProduct } from "../utils/syncContextUtils";

export const assertSyncCurrencyMatchesCustomer = ({
	syncContext,
}: {
	syncContext: SyncBillingContext;
}) => {
	const customerCurrency = syncContext.fullCustomer.currency?.toLowerCase();
	if (
		!customerCurrency ||
		customerCurrency === syncContext.currency ||
		!syncContextHasPaidProduct({ syncContext })
	) {
		return;
	}

	throw new RecaseError({
		message: `Customer is locked to ${customerCurrency.toUpperCase()} and cannot sync a ${syncContext.currency.toUpperCase()} subscription`,
		code: ErrCode.CurrencyMismatch,
		statusCode: 400,
	});
};
