import {
	AttachScenario,
	CusProductStatus,
	cusProductToProduct,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { setStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { cusProductToSub } from "../cusProducts/cusProductUtils/convertCusProduct.js";
import { getExistingCusProducts } from "../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { activateDefaultProduct } from "../cusProducts/cusProductUtils.js";

export const cancelImmediately = async ({
	ctx,
	cusProduct,
	fullCus,
	prorate,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
	fullCus: FullCustomer;
	prorate: boolean;
}) => {
	const { db, org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const { curScheduledProduct } = getExistingCusProducts({
		product: cusProduct.product,
		cusProducts: fullCus.customer_products,
		internalEntityId: cusProduct.internal_entity_id,
	});

	const sub = await cusProductToSub({ cusProduct, stripeCli });

	if (sub) {
		// Set lock to prevent webhook handler from processing this cancellation
		await setStripeSubscriptionLock({
			stripeSubscriptionId: sub.id,
			lockedAtMs: Date.now(),
		});

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
			ctx,
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
		ctx,
		internalCustomerId: fullCus.internal_id,
		org,
		env,
		customerId: fullCus.id || null,
		cusProduct,
		scenario: AttachScenario.Expired,
	});
};
