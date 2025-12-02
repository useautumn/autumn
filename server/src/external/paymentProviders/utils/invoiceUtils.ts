import type { AppEnv, Organization } from "@autumn/shared";
import type { PaymentProvider } from "@autumn/shared/utils/paymentProviders/types.js";
import type {
	CreateInvoiceParams,
	PayInvoiceParams,
	FinalizeInvoiceParams,
	UpdateInvoiceParams,
	RetrieveInvoiceOptions,
} from "@autumn/shared/utils/paymentProviders/types.js";
import { createPaymentProvider } from "../factory.js";

/**
 * Payment provider-aware invoice utilities
 */
export const createPaymentProviderInvoice = async ({
	org,
	env,
	params,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	params: CreateInvoiceParams;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.invoices.create(params);
};

export const getPaymentProviderInvoice = async ({
	org,
	env,
	invoiceId,
	options,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	invoiceId: string;
	options?: RetrieveInvoiceOptions;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.invoices.retrieve(invoiceId, options);
};

export const updatePaymentProviderInvoice = async ({
	org,
	env,
	invoiceId,
	params,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	invoiceId: string;
	params: UpdateInvoiceParams;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.invoices.update(invoiceId, params);
};

export const finalizePaymentProviderInvoice = async ({
	org,
	env,
	invoiceId,
	params,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	invoiceId: string;
	params?: FinalizeInvoiceParams;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.invoices.finalize(invoiceId, params);
};

export const payPaymentProviderInvoice = async ({
	org,
	env,
	invoiceId,
	params,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	invoiceId: string;
	params: PayInvoiceParams;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.invoices.pay(invoiceId, params);
};

export const voidPaymentProviderInvoice = async ({
	org,
	env,
	invoiceId,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	invoiceId: string;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.invoices.void(invoiceId);
};

