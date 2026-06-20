/** biome-ignore-all lint/suspicious/noExplicitAny: can use any*/

import { AppEnv } from "@autumn/shared";

type CustomButtonCustomer = { id?: string | null; email?: string | null };

const CUSTOM_BUTTON_VARS: Record<
	string,
	(customer: CustomButtonCustomer) => string
> = {
	"{customerId}": (customer) => customer.id ?? "",
	"{customerEmail}": (customer) => customer.email ?? "",
};

export const resolveCustomButtonUrl = (
	template: string,
	customer: CustomButtonCustomer,
) => {
	let resolved = template;
	for (const [token, getValue] of Object.entries(CUSTOM_BUTTON_VARS)) {
		resolved = resolved.replaceAll(
			token,
			encodeURIComponent(getValue(customer)),
		);
	}
	return resolved;
};

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export const isSafeCustomButtonUrl = (url: string) => {
	try {
		return SAFE_PROTOCOLS.has(new URL(url).protocol);
	} catch {
		return false;
	}
};

export const getStripeCusLink = ({
	customerId,
	env,
	accountId,
}: {
	customerId: string;
	env: AppEnv;
	accountId?: string;
}) => {
	const baseUrl = `https://dashboard.stripe.com`;
	const accountPath = accountId ? `/${accountId}` : "";
	const withTest = env === AppEnv.Live ? "" : "/test";
	return `${baseUrl}${accountPath}${withTest}/customers/${customerId}`;
};

export const getRevenueCatCusLink = ({
	customerId,
	projectId,
}: {
	customerId: string;
	projectId: string;
}) => {
	return `https://app.revenuecat.com/projects/${projectId}/customers/${customerId}`;
};

export const getStripeSubLink = ({
	subscriptionId,
	env,
	accountId,
}: {
	subscriptionId: string;
	env: AppEnv;
	accountId?: string;
}) => {
	const baseUrl = `https://dashboard.stripe.com`;
	const accountPath = accountId ? `/${accountId}` : "";
	const withTest = env === AppEnv.Live ? "" : "/test";
	return `${baseUrl}${accountPath}${withTest}/subscriptions/${subscriptionId}`;
};

export const getStripeSubScheduleLink = ({
	scheduledId,
	env,
	accountId,
}: {
	scheduledId: string;
	env: AppEnv;
	accountId?: string;
}) => {
	const baseUrl = `https://dashboard.stripe.com`;
	const accountPath = accountId ? `/${accountId}` : "";
	const withTest = env === AppEnv.Live ? "" : "/test";
	return `${baseUrl}${accountPath}${withTest}/subscription_schedules/${scheduledId}`;
};

export const getStripeInvoiceLink = ({
	stripeInvoice,
	env,
	accountId,
}: {
	stripeInvoice: any;
	env: AppEnv;
	accountId?: string;
}) => {
	const baseUrl = `https://dashboard.stripe.com`;
	const accountPath = accountId ? `/${accountId}` : "";
	const withTest = env === AppEnv.Live ? "" : "/test";
	const invoiceId =
		typeof stripeInvoice === "string"
			? stripeInvoice
			: stripeInvoice.id || stripeInvoice.stripe_id;
	return `${baseUrl}${accountPath}${withTest}/invoices/${invoiceId}`;
};

export const getStripeDashboardLink = ({
	env,
	accountId,
}: {
	env: AppEnv;
	accountId?: string;
}) => {
	const baseUrl = `https://dashboard.stripe.com`;
	const accountPath = accountId ? `/${accountId}` : "";
	const withTest = env === AppEnv.Live ? "" : "/test";
	return `${baseUrl}${accountPath}${withTest}/dashboard`;
};

export const getStripeConnectViewAsLink = ({
	masterAccountId,
	connectedAccountId,
	env,
	path = "payments",
}: {
	masterAccountId: string;
	connectedAccountId: string;
	env: AppEnv;
	path?: string;
}) => {
	const baseUrl = `https://dashboard.stripe.com`;
	const withTest = env === AppEnv.Live ? "" : "/test";
	return `${baseUrl}/${masterAccountId}/connect/view-as/${connectedAccountId}${withTest}/${path}`;
};

export const getStripeCouponLink = ({
	couponId,
	env,
	accountId,
}: {
	couponId: string;
	env: AppEnv;
	accountId?: string;
}) => {
	const baseUrl = `https://dashboard.stripe.com`;
	const accountPath = accountId ? `/${accountId}` : "";
	const withTest = env === AppEnv.Live ? "" : "/test";
	return `${baseUrl}${accountPath}${withTest}/coupons/${encodeURIComponent(couponId)}`;
};
