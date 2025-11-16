import {
	ApiVersion,
	AttachScenario,
	BillingType,
	CusProductStatus,
	cusProductToPrices,
	type FullCusProduct,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { createUsageInvoice } from "@/internal/customers/attach/attachFunctions/upgradeDiffIntFlow/createUsageInvoice.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import {
	activateDefaultProduct,
	activateFutureProduct,
} from "@/internal/customers/cusProducts/cusProductUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { getCusPaymentMethod } from "../../stripeCusUtils.js";
import { webhookToAttachParams } from "../../webhookUtils/webhookUtils.js";

export const handleCusProductDeleted = async ({
	req,
	db,
	stripeCli,
	cusProduct,
	subscription,
	logger,
	prematurelyCanceled,
}: {
	req: ExtendedRequest;
	db: DrizzleCli;
	stripeCli: Stripe;
	cusProduct: FullCusProduct;
	subscription: Stripe.Subscription;
	logger: any;
	prematurelyCanceled: boolean;
}) => {
	const { org, env } = req;
	const { scheduled_ids } = cusProduct;
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: cusProduct.internal_customer_id,
		orgId: org.id,
		env,
		withEntities: true,
	});

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: fullCus.processor?.id,
	});

	const isV4Usage = cusProduct.api_semver === ApiVersion.V1_Beta;

	// refer to handleUpgradeFlow.ts, when cancel immediately through API / dashboard, this happens...?
	const isAutumnCancel =
		subscription.cancellation_details?.comment === "autumn_cancel";

	if ((cusProduct.internal_entity_id || isV4Usage) && !isAutumnCancel) {
		const usagePrices = cusProductToPrices({
			cusProduct,
			billingType: BillingType.UsageInArrear,
		});

		if (usagePrices.length > 0) {
			logger.info(
				`sub.deleted, submitting usage for ${fullCus.id}, ${cusProduct.product.name}`,
			);

			await createUsageInvoice({
				db,
				attachParams: webhookToAttachParams({
					req,
					stripeCli,
					paymentMethod,
					cusProduct,
					fullCus,
				}),
				cusProduct,
				sub: subscription,
				logger,
			});
		}
	}

	if (scheduled_ids && scheduled_ids.length > 0 && !prematurelyCanceled) {
		logger.info(
			`sub.deleted: removing sub_id from cus product ${cusProduct.id}`,
		);
		await CusProductService.update({
			db,
			cusProductId: cusProduct.id,
			updates: {
				subscription_ids: cusProduct.subscription_ids?.filter(
					(id) => id !== subscription.id,
				),
			},
		});

		return;
	}

	logger.info(`sub.deleted: expiring cus product ${cusProduct.id}`);
	await CusProductService.update({
		db,
		cusProductId: cusProduct.id,
		updates: {
			status: CusProductStatus.Expired,
			ended_at: subscription.ended_at ? subscription.ended_at * 1000 : null,
		},
	});

	await addProductsUpdatedWebhookTask({
		req,
		internalCustomerId: cusProduct.internal_customer_id,
		org,
		env,
		customerId: null,
		scenario: AttachScenario.Expired,
		cusProduct,
		logger,
	});

	if (cusProduct.product.is_add_on) return;

	const activatedFuture = await activateFutureProduct({
		req,
		cusProduct,
	});

	if (activatedFuture) {
		logger.info(`✅ sub.deleted: activated scheduled product`);
		return;
	}

	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId: cusProduct.internal_customer_id,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	const { curMainProduct } = getExistingCusProducts({
		product: cusProduct.product,
		cusProducts,
	});

	await activateDefaultProduct({
		req,
		productGroup: cusProduct.product.group,
		fullCus,
		curCusProduct: curMainProduct || undefined,
	});
};
