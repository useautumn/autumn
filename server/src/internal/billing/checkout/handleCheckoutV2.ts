import {
	AffectedResource,
	ApiVersion,
	AttachFunction,
	CheckoutParamsV0Schema,
} from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import type { ExtendedRequest } from "../../../utils/models/Request";
import { handleCreateCheckout } from "../../customers/add-product/handleCreateCheckout";
import { handleCreateInvoiceCheckout } from "../../customers/add-product/handleCreateInvoiceCheckout";
import {
	checkStripeConnections,
	handlePrepaidErrors,
} from "../../customers/attach/attachRouter";
import { handleCheckoutErrors } from "../../customers/attach/attachUtils/handleAttachErrors/handleCheckoutErrors";
import { attachParamsToPreview } from "../attachPreview/attachParamsToPreview";
import { getHasProrations } from "./getHasProrations";
import { previewToCheckoutRes } from "./previewToCheckoutRes";
import { checkoutToAttachContext } from "./utils/checkoutToAttachContext";
import { getCheckoutOptions } from "./utils/getCheckoutOptions";

export const handleCheckoutV2 = createRoute({
	versionedBody: {
		latest: CheckoutParamsV0Schema,
		[ApiVersion.V1_Beta]: CheckoutParamsV0Schema,
	},
	resource: AffectedResource.Checkout,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { attachParams, branch, func, config } =
			await checkoutToAttachContext({
				ctx,
				checkoutParams: body,
			});

		let checkoutUrl = null;

		handleCheckoutErrors({
			attachParams,
			branch,
		});

		if (func === AttachFunction.CreateCheckout) {
			await checkStripeConnections({
				ctx,
				attachParams,
				createCus: true,
				useCheckout: true,
			});

			await handlePrepaidErrors({
				attachParams,
				config,
				useCheckout: config.onlyCheckout,
			});

			if (config.invoiceCheckout) {
				const result = await handleCreateInvoiceCheckout({
					req: ctx as ExtendedRequest,
					attachParams,
					attachBody: body,
					branch,
					config,
				});

				checkoutUrl = result?.invoices?.[0]?.hosted_invoice_url;
			} else {
				const checkout = await handleCreateCheckout({
					req: ctx as ExtendedRequest,
					attachParams,
					config,
					returnCheckout: true,
				});

				checkoutUrl = checkout?.url;
			}
		}

		await getCheckoutOptions({
			ctx,
			attachParams,
		});

		const preview = await attachParamsToPreview({
			ctx,
			attachParams,
			attachBody: body,
			withPrepaid: true,
		});

		const checkoutRes = await previewToCheckoutRes({
			req: ctx as ExtendedRequest,
			attachParams,
			preview,
			branch,
		});

		// Get has prorations
		const hasProrations = await getHasProrations({
			branch,
			attachParams,
		});

		return c.json({
			...checkoutRes,
			url: checkoutUrl,
			has_prorations: hasProrations,
		});
	},
});
