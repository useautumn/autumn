import {
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { DeductionUpdate } from "../types/deductionUpdate";
import { computeAllocatedInvoicePlan } from "./compute/computeAllocatedInvoicePlan";
import { setupAllocatedInvoiceContext } from "./setupAllocatedInvoiceContext";

export const createAllocatedInvoice = async ({
	ctx,
	customerEntitlement,
	fullCustomer,
	update,
}: {
	ctx: AutumnContext;
	customerEntitlement: FullCusEntWithFullCusProduct;
	fullCustomer: FullCustomer;
	update: DeductionUpdate;
}) => {
	const billingContext = await setupAllocatedInvoiceContext({
		ctx,
		customerEntitlement,
		fullCustomer,
		update,
	});

	if (!billingContext) {
		throw new InternalError({
			message: "setupAllocatedInvoiceContext: no billing context found",
		});
	}

	const plan = computeAllocatedInvoicePlan({
		ctx,
		billingContext,
	});

	console.log("Plan:", JSON.stringify(plan, null, 2));
};
