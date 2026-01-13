import type { WebhookInitialPurchase } from "@puzzmo/revenue-cat-webhook-types";
import {
	AttachScenario,
	CusProductStatus,
	cusProductToPrices,
	ErrCode,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import {
	attachToInsertParams,
	isProductUpgrade,
} from "@/internal/products/productUtils";
import { isMainProduct } from "@/internal/products/productUtils/classifyProduct";

export const handleInitialPurchase = async ({
	event,
	ctx,
}: {
	event: WebhookInitialPurchase;
	ctx: RevenueCatWebhookContext;
}) => {
	const { db, org, env, logger, features } = ctx;
	const { product_id, app_user_id } = event;

	const { product, customer, cusProducts } = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: app_user_id,
		autoCreateCustomer: true,
	});

	const { curSameProduct, curMainProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	// If same product already exists, skip
	if (curSameProduct) {
		throw new RecaseError({
			message: `[handleInitialPurchase] Customer ${customer.id} already has product ${product.id}`,
			code: ErrCode.CustomerAlreadyHasProduct,
			statusCode: 400,
		});
	}

	const now = Date.now();
	let scenario = AttachScenario.New;

	// Handle upgrade/downgrade (only when both are main products)
	const isNewProductMain = isMainProduct({ product, prices: product.prices });

	if (curMainProduct && isNewProductMain) {
		const curPrices = cusProductToPrices({ cusProduct: curMainProduct });
		const newPrices = product.prices;

		const isUpgrade = isProductUpgrade({
			prices1: curPrices,
			prices2: newPrices,
		});

		scenario = isUpgrade ? AttachScenario.Upgrade : AttachScenario.Downgrade;

		logger.info(
			`${isUpgrade ? "Upgrade" : "Downgrade"} detected: ${curMainProduct.product.id} -> ${product.id}`,
		);

		// Expire old cus_product
		await CusProductService.update({
			db,
			cusProductId: curMainProduct.id,
			updates: {
				status: CusProductStatus.Expired,
				ended_at: now,
			},
		});

		logger.info(`Expired old cus_product: ${curMainProduct.id}`);
	}

	// Create new cus_product
	await createFullCusProduct({
		db,
		logger,
		scenario,
		processorType: ProcessorType.RevenueCat,
		attachParams: attachToInsertParams(
			{
				customer,
				products: [product],
				prices: product.prices,
				entitlements: product.entitlements,
				entities: customer.entities || [],
				org,
				stripeCli: createStripeCli({ org, env }),
				now,
				paymentMethod: null,
				freeTrial: null,
				optionsList: [],
				cusProducts,
				replaceables: [],
				features,
			},
			product,
		),
	});

	logger.info(
		`Created cus_product for ${product.id} with scenario: ${scenario}`,
	);
};
