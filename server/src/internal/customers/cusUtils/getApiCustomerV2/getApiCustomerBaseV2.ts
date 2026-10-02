import {
	type ApiInvoiceV1,
	type FullSubject,
	getApiCustomerBaseV2 as renderSharedCustomerBase,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBalanceAllocationControls } from "@/internal/balances/allocate/getBalanceAllocationControls.js";

export const getApiCustomerBaseV2 = async ({
	ctx,
	fullSubject,
	withAutumnId = true,
	invoices,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	withAutumnId?: boolean;
	invoices?: ApiInvoiceV1[];
}) => {
	const { apiCustomer, legacyData } = await renderSharedCustomerBase({
		ctx,
		fullSubject,
		withAutumnId,
		invoices,
	});
	const balanceAllocations = await getBalanceAllocationControls({
		ctx,
		internalCustomerId: fullSubject.customer.internal_id,
		allocations: fullSubject.customer.balance_allocations,
	});
	return {
		apiCustomer: {
			...apiCustomer,
			billing_controls: {
				...apiCustomer.billing_controls,
				balance_allocations: balanceAllocations,
			},
		},
		legacyData,
	};
};
