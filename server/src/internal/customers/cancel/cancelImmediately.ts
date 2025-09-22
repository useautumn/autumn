import { createStripeCli } from "@/external/stripe/utils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
	AttachScenario,
	CusProductStatus,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";

import { cusProductToProduct } from "@autumn/shared";

import { CusProductService } from "../cusProducts/CusProductService.js";
import { activateDefaultProduct } from "../cusProducts/cusProductUtils.js";
import { getExistingCusProducts } from "../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import { cusProductToSub } from "../cusProducts/cusProductUtils/convertCusProduct.js";

export const cancelImmediately = async ({
	req,
	cusProduct,
	fullCus,
	prorate,
}: {
	req: ExtendedRequest;
	cusProduct: FullCusProduct;
	fullCus: FullCustomer;
	prorate: boolean;
}) => {
	const { db, org, env, logger } = req;
	const stripeCli = createStripeCli({ org, env });

	const { curScheduledProduct } = getExistingCusProducts({
		product: cusProduct.product,
		cusProducts: fullCus.customer_products,
		internalEntityId: cusProduct.internal_entity_id,
	});

	const sub = await cusProductToSub({ cusProduct, stripeCli });

	if (sub) {
		await stripeCli.subscriptions.cancel(sub.id, {
			prorate: prorate,
			cancellation_details: {
				comment: "autumn_cancel",
			},
		});
	}

	const isMain = !cusProduct.product.is_add_on;
	const product = cusProductToProduct({ cusProduct });

	if (isMain && !isOneOff(product.prices)) {
		// So it doesn't duplicate
		if (curScheduledProduct) {
			await CusProductService.delete({
				db,
				cusProductId: curScheduledProduct.id,
			});
		}

		await activateDefaultProduct({
			req,
			productGroup: cusProduct.product.group,
			fullCus,
		});
	}

	await CusProductService.update({
		db,
		cusProductId: cusProduct.id,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: Date.now(),
		},
	});

	console.log("Sending webhook for expired product");
	await addProductsUpdatedWebhookTask({
		req,
		internalCustomerId: fullCus.internal_id,
		org,
		env,
		customerId: fullCus.id || null,
		cusProduct,
		scenario: AttachScenario.Expired,
		logger,
	});
};
