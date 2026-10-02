import {
	AffectedResource,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	CustomerExpand,
	type FullSubject,
	fullSubjectToApiCustomerV5,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getBalanceAllocationControls } from "@/internal/balances/allocate/getBalanceAllocationControls.js";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { getApiCustomerExpandV2 } from "../apiCusUtils/getApiCustomerExpandV2.js";

/**
 * Transform FullSubject to ApiCustomer with expand fields and version changes applied.
 */
export const getApiCustomerV2 = async ({
	ctx,
	fullSubject,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
	withAutumnId?: boolean;
}): Promise<ApiCustomerV5> => {
	// An invoice's hosted URL is built from this server's address, so invoices are rendered here and handed in.
	const shouldExpandInvoices = ctx.expand.includes(CustomerExpand.Invoices);
	const invoices = shouldExpandInvoices
		? invoicesToResponse({ invoices: fullSubject.invoices ?? [] })
		: undefined;

	const { apiCustomer: cleanedBaseCustomer, legacyData } =
		await fullSubjectToApiCustomerV5({
			ctx,
			fullSubject,
			apiVersion: ctx.apiVersion,
			withAutumnId,
			invoices,
			balanceAllocations: await getBalanceAllocationControls({
				ctx,
				internalCustomerId: fullSubject.customer.internal_id,
				allocations: fullSubject.customer.balance_allocations,
			}),
		});

	const apiCustomerExpand = await getApiCustomerExpandV2({
		ctx,
		fullSubject,
		autoTopupsConfig: cleanedBaseCustomer.billing_controls.auto_topups,
	});

	const { billing_controls_override, ...standardExpand } = apiCustomerExpand;

	const apiCustomer: ApiCustomerV5 = {
		...cleanedBaseCustomer,
		...standardExpand,
		...(billing_controls_override
			? {
					billing_controls: {
						...cleanedBaseCustomer.billing_controls,
						auto_topups: billing_controls_override.auto_topups,
					},
				}
			: {}),
	};

	return applyResponseVersionChanges<ApiCustomerV5>({
		input: apiCustomer,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		legacyData,
		ctx,
	});
};
