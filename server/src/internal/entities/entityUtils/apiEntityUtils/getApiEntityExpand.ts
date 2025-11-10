import type { EntityExpand, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";

export type ApiEntityExpand = {
	invoices?: any[];
};

export const getApiEntityExpand = async ({
	ctx,
	customerId,
	entityId,
	fullCus,
	expand,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	fullCus?: FullCustomer;
	expand: EntityExpand[];
}): Promise<ApiEntityExpand> => {
	const { org, env, db, logger } = ctx;

	if (expand.length === 0) return {};

	if (!fullCus) {
		fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId || "",
			orgId: org.id,
			env,
			expand: expand as any, // EntityExpand is compatible with CusExpand for 'invoices'
			entityId,
		});
	}

	const invoices = expand.includes("invoices" as EntityExpand)
		? invoicesToResponse({
				invoices: fullCus.invoices || [],
				logger,
			})
		: undefined;

	return {
		invoices,
	};
};
