import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { CusService } from "@/internal/customers/CusService";

const ALL_PRODUCTS_LIMIT = 1000;

export const loadCustomerWithAllProducts = ({
	ctx,
	internalId,
}: {
	ctx: RevenueCatWebhookContext;
	internalId: string;
}) =>
	CusService.getFull({
		ctx,
		idOrInternalId: internalId,
		withEntities: true,
		withSubs: true,
		cusProductLimit: ALL_PRODUCTS_LIMIT,
	});
