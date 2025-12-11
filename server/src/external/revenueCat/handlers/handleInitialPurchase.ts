import type { WebhookInitialPurchase } from "@puzzmo/revenue-cat-webhook-types";
import {
	type AppEnv,
	AttachScenario,
	CusProductStatus,
	cusProductToPrices,
	ErrCode,
	type Feature,
	type Organization,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { RCMappingService } from "@/external/revenueCat/services/RCMappingService";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { ProductService } from "@/internal/products/ProductService";
import {
	attachToInsertParams,
	isProductUpgrade,
} from "@/internal/products/productUtils";
import { isMainProduct } from "@/internal/products/productUtils/classifyProduct";

export const handleInitialPurchase = async ({
	event,
	db,
	org,
	env,
	logger,
	features,
}: {
	event: WebhookInitialPurchase;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	logger: Logger;
	features: Feature[];
}) => {
	// Look up Autumn product ID from RevenueCat mapping
	const autumnProductId = await RCMappingService.getAutumnProductId({
		db,
		orgId: org.id,
		env,
		revcatProductId: event.product_id,
	});

	if (!autumnProductId) {
		throw new RecaseError({
			message: `No Autumn product mapped to RevenueCat product: ${event.product_id}`,
			code: ErrCode.ProductNotFound,
			statusCode: 404,
		});
	}

	const [product, customer] = await Promise.all([
		ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: autumnProductId,
		}),
		CusService.getFull({
			db,
			idOrInternalId: event.app_user_id,
			orgId: org.id,
			env,
		}),
	]);

	if (!product) {
		throw new RecaseError({
			message: "Product not found",
			code: ErrCode.ProductNotFound,
			statusCode: 404,
		});
	}

	if (!customer) {
		throw new RecaseError({
			message: "Customer not found",
			code: ErrCode.CustomerNotFound,
			statusCode: 404,
		});
	}

	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId: customer.internal_id,
	});

	const { curSameProduct, curMainProduct } = getExistingCusProducts({
		product,
		cusProducts,
		internalEntityId: undefined,
		processorType: ProcessorType.RevenueCat,
	});

	// If same product already exists, skip
	if (curSameProduct) {
		throw new RecaseError({
			message: "Cus product already exists",
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
		externalSubIds: [
			{ type: ProcessorType.RevenueCat, id: event.original_transaction_id },
		],
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

	await deleteCachedApiCustomer({
		customerId: customer.id ?? "",
		orgId: org.id,
		env,
	});
};
