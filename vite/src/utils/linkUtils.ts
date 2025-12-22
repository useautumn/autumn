/** biome-ignore-all lint/suspicious/noExplicitAny: can use any*/

import { AppEnv } from "@autumn/shared";

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
	return `${baseUrl}${accountPath}${withTest}/invoices/${stripeInvoice.id || stripeInvoice.stripe_id}`;
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
