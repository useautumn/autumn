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
	const baseUrl = `https://dashboard.stripe.com${
		env === AppEnv.Live ? "" : "/test"
	}`;
	const accountPath = accountId ? `/${accountId}` : "";
	return `${baseUrl}${accountPath}/customers/${customerId}`;
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
	const baseUrl = `https://dashboard.stripe.com${
		env === AppEnv.Live ? "" : "/test"
	}`;
	const accountPath = accountId ? `/${accountId}` : "";
	return `${baseUrl}${accountPath}/subscriptions/${subscriptionId}`;
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
	const baseUrl = `https://dashboard.stripe.com${
		env === AppEnv.Live ? "" : "/test"
	}`;
	const accountPath = accountId ? `/${accountId}` : "";
	return `${baseUrl}${accountPath}/subscription_schedules/${scheduledId}`;
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
	const baseUrl = `https://dashboard.stripe.com${
		env === AppEnv.Live ? "" : "/test"
	}`;
	const accountPath = accountId ? `/${accountId}` : "";
	return `${baseUrl}${accountPath}/invoices/${stripeInvoice.id || stripeInvoice.stripe_id}`;
};
