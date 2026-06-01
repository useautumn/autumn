import {
	AttachScenario,
	CusProductStatus,
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { sendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

const statusToScenario = (status: CusProductStatus): AttachScenario => {
	switch (status) {
		case CusProductStatus.Scheduled:
			return AttachScenario.Scheduled;
		case CusProductStatus.PastDue:
			return AttachScenario.PastDue;
		case CusProductStatus.Expired:
			return AttachScenario.Expired;
		default:
			return AttachScenario.Active;
	}
};

export const handleSendCustomerProductUpdatedWebhook = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({
		customer_product_id: z.string().min(1),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_product_id: customerProductId } = c.req.param();
		const customerProduct = await CusProductService.getFull({
			db: ctx.db,
			id: customerProductId,
		});

		if (
			!customerProduct ||
			customerProduct.product.org_id !== ctx.org.id ||
			customerProduct.product.env !== ctx.env
		) {
			throw new RecaseError({
				message: `Customer product not found: ${customerProductId}`,
				code: ErrCode.CusProductNotFound,
				statusCode: 404,
			});
		}

		const customerId =
			customerProduct.customer_id ?? customerProduct.internal_customer_id;

		await sendProductsUpdated({
			ctx,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				customerProductId,
				scenario: statusToScenario(customerProduct.status),
			},
		});

		return c.json({ success: true });
	},
});
