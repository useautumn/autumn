import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
	CustomerExpand,
	type CustomerLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { invoicesToResponse } from "../../../invoices/invoiceUtils.js";
import { getApiBalances } from "./getApiBalance/getApiBalances.js";
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
	expandParams,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	withAutumnId?: boolean;
	expandParams?: { plan?: boolean };
}): Promise<{ apiCustomer: ApiCustomerV5; legacyData: CustomerLegacyData }> => {
	const { data: apiBalances } = await getApiBalances({
		ctx,
		fullCus,
	});

	const {
		subscriptions: apiSubscriptions,
		purchases: apiPurchases,
		legacyData: cusProductLegacyData,
	} = await getApiSubscriptions({
		ctx,
		fullCus,
		expandParams,
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
		send_email_receipts: fullCus.send_email_receipts ?? false,
		billing_controls: fullCus.auto_topup
			? { auto_topup: fullCus.auto_topup }
			: undefined,

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
