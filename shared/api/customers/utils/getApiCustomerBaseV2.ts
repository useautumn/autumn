import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
	type ApiInvoiceV1,
	type CustomerLegacyData,
	type FullSubject,
	fullSubjectToApiUsageLimits,
	getApiBalancesV2,
	getApiCustomerLicenses,
	getApiSubscriptionsV2,
	orgToInStatuses,
	type SharedContext,
	scopeExpandForCtx,
} from "@autumn/shared";
import { z } from "zod/v4";
import { getCusProcessors } from "../cusProcessors/utils/getCusProcessors.js";

/**
 * Get base ApiCustomer without expand fields from FullSubject.
 * By default, it includes the autumn_id.
 */
export const getApiCustomerBaseV2 = async ({
	ctx,
	fullSubject,
	withAutumnId = true,
	invoices,
}: {
	ctx: SharedContext;
	fullSubject: FullSubject;
	withAutumnId?: boolean;
	/** Already in API form: an invoice's hosted URL is built from the server's own address, which this has no way to know. */
	invoices?: ApiInvoiceV1[];
}): Promise<{ apiCustomer: ApiCustomerV5; legacyData: CustomerLegacyData }> => {
	const { balances: apiBalances, flags: apiFlags } = getApiBalancesV2({
		ctx,
		fullSubject,
	});

	const subscriptionsScopedCtx = scopeExpandForCtx({
		ctx,
		prefix: "subscriptions",
	});

	const {
		subscriptions: apiSubscriptions,
		purchases: apiPurchases,
		legacyData: cusProductLegacyData,
	} = await getApiSubscriptionsV2({
		ctx: subscriptionsScopedCtx,
		fullSubject,
	});

	const apiLicenses = getApiCustomerLicenses({
		customerProducts: fullSubject.customer_products,
	});

	const customer = fullSubject.customer;
	const usageLimits = fullSubjectToApiUsageLimits({
		fullSubject,
		features: ctx.features,
		inStatuses: orgToInStatuses({ org: ctx.org }),
	});

	const apiCustomer = ApiCustomerV5Schema.extend({
		autumn_id: z.string().optional(),
	}).parse({
		autumn_id: withAutumnId ? customer.internal_id : undefined,
		id: customer.id || null,
		created_at: customer.created_at,
		name: customer.name || null,
		email: customer.email || null,
		fingerprint: customer.fingerprint || null,
		stripe_id: customer.processor?.id || null,
		env: customer.env,
		metadata: customer.metadata ?? {},
		subscriptions: apiSubscriptions,
		purchases: apiPurchases,
		licenses: apiLicenses,
		balances: apiBalances,
		flags: apiFlags,
		send_email_receipts: customer.send_email_receipts ?? false,
		billing_controls: {
			auto_topups: customer.auto_topups ?? undefined,
			spend_limits: customer.spend_limits ?? undefined,
			usage_limits: usageLimits,
			usage_alerts: customer.usage_alerts ?? undefined,
			overage_allowed: customer.overage_allowed ?? undefined,
		},
		config: customer.config
			? {
					disable_pooled_balance: customer.config.disable_pooled_balance,
					disable_overage_billing: customer.config.disable_overage_billing,
				}
			: undefined,
		processors: getCusProcessors({
			customer,
			customer_products: fullSubject.customer_products,
		}),
		invoices,
	} satisfies ApiCustomerV5);

	return {
		apiCustomer,
		legacyData: {
			cusProductLegacyData,
		},
	};
};
