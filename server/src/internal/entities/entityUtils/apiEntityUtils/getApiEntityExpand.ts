import { CustomerExpand, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { InvoiceService } from "../../../invoices/InvoiceService";
import { invoicesToResponse } from "../../../invoices/invoiceUtils";

type ApiEntityExpand = {
	invoices?: any[];
};

export const getApiEntityExpand = async ({
	ctx,
	customerId,
	entityId,
	fullCus,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	fullCus?: FullCustomer;
}): Promise<ApiEntityExpand> => {
	const { org, env, db, logger } = ctx;

	if (!ctx.expand.includes(CustomerExpand.Invoices)) {
		return {};
	}

	if (!fullCus) {
		fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customerId || "",
			entityId,
		});
	}

	const invoices = await InvoiceService.list({
		db,
		internalCustomerId: fullCus.internal_id,
		internalEntityId: fullCus.entity?.internal_id,
	});

	// console.log("Entity invoices:", invoices);

	return {
		invoices: invoicesToResponse({
			invoices,
		}),
	};
};
