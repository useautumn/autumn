import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
	CusExpand,
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
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	withAutumnId?: boolean;
}): Promise<{ apiCustomer: ApiCustomerV5; legacyData: CustomerLegacyData }> => {
	const { data: apiBalances, legacyData: cusFeatureLegacyData } =
		await getApiBalances({
			ctx,
			fullCus,
		});

	const { data: apiSubscriptions, legacyData: cusProductLegacyData } =
		await getApiSubscriptions({
			ctx,
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
		metadata: fullCus.metadata,

		subscriptions: apiSubscriptions,
		purchases: {},

		balances: apiBalances,

		invoices:
			fullCus.invoices && ctx.expand.includes(CusExpand.Invoices)
				? invoicesToResponse({
						invoices: fullCus.invoices,
					})
				: undefined,
	});

	return {
		apiCustomer,
		legacyData: {
			cusProductLegacyData,
			cusFeatureLegacyData,
		},
	};
};
