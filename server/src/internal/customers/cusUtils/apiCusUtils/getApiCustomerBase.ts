import { getApiBalances } from "@api/customers/cusFeatures";
import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
	CustomerExpand,
	type CustomerLegacyData,
	type FullCustomer,
	scopeExpandForCtx,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { invoicesToResponse } from "../../../invoices/invoiceUtils.js";
import { getApiSubscriptions } from "./getApiSubscription/getApiSubscriptions.js";

/**
 * Get base ApiCustomer without expand fields
 * This is the core customer object that can be cached
 * By default, it includes the autumn_id
 */
export const getApiCustomerBase = async ({
	ctx,
	fullCus,
	withAutumnId = true,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	withAutumnId?: boolean;
}): Promise<{ apiCustomer: ApiCustomerV5; legacyData: CustomerLegacyData }> => {
	const { balances: apiBalances, flags: apiFlags } = await getApiBalances({
		ctx,
		fullCus,
	});

	const subscriptionsScopedCtx = scopeExpandForCtx({
		ctx,
		prefix: "subscriptions",
	});

	const {
		subscriptions: apiSubscriptions,
		purchases: apiPurchases,
		legacyData: cusProductLegacyData,
	} = await getApiSubscriptions({
		ctx: subscriptionsScopedCtx,
		fullCus,
	});

	const apiCustomer = ApiCustomerV5Schema.extend({
		autumn_id: z.string().optional(),
	}).parse({
		autumn_id: withAutumnId ? fullCus.internal_id : undefined,

		id: fullCus.id || null,
		created_at: fullCus.created_at,
		name: fullCus.name || null,
		email: fullCus.email || null,
		fingerprint: fullCus.fingerprint || null,

		stripe_id: fullCus.processor?.id || null,
		env: fullCus.env,
		metadata: fullCus.metadata ?? {},

		subscriptions: apiSubscriptions,
		purchases: apiPurchases,
		balances: apiBalances,
		flags: apiFlags,
		send_email_receipts: fullCus.send_email_receipts ?? false,
		billing_controls: {
			auto_topups: fullCus.auto_topups ?? undefined,
			spend_limits: fullCus.spend_limits ?? undefined,
			usage_alerts: fullCus.usage_alerts ?? undefined,
		},

		invoices:
			fullCus.invoices && ctx.expand.includes(CustomerExpand.Invoices)
				? invoicesToResponse({
						invoices: fullCus.invoices,
					})
				: undefined,
	} satisfies ApiCustomerV5);

	return {
		apiCustomer,
		legacyData: {
			cusProductLegacyData,
		},
	};
};
