import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { CusService } from "@/internal/customers/CusService";

const ALL_PRODUCTS_LIMIT = 1000;

/** The default customer read pages products; a transfer must see every product on both sides. */
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
