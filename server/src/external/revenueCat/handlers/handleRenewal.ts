import type { WebhookRenewal } from "@puzzmo/revenue-cat-webhook-types";
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
import type { Logger } from "@/external/logtail/logtailUtils";
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

export const handleRenewal = async ({
	event,
	db,
	org,
	env,
	logger,
	features,
}: {
	event: WebhookRenewal;
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

	if (
		cusProducts.some((cp) => cp.processor?.type !== ProcessorType.RevenueCat)
	) {
		throw new RecaseError({
			message: "Customer already has a product from a different processor.",
			code: ErrCode.CustomerAlreadyHasProduct,
			statusCode: 400,
		});
	}

	const { curSameProduct, curMainProduct } = getExistingCusProducts({
		product,
		cusProducts,
		internalEntityId: undefined,
		processorType: ProcessorType.RevenueCat,
	});

	const now = Date.now();

	// If same product exists and is active, this is just a renewal - nothing to do
	if (curSameProduct && curSameProduct.status === CusProductStatus.Active) {
		logger.info(
			`Renewal for existing active product ${product.id}, no action needed`,
		);
		return;
	}

	// Check if this is an upgrade (renewing to a different/better product)
	const isNewProductMain = isMainProduct({ product, prices: product.prices });
	let scenario = AttachScenario.New;

	if (curMainProduct && isNewProductMain) {
		const curPrices = cusProductToPrices({ cusProduct: curMainProduct });
		const newPrices = product.prices;

		const isUpgrade = isProductUpgrade({
			prices1: curPrices,
			prices2: newPrices,
		});

		scenario = isUpgrade ? AttachScenario.Upgrade : AttachScenario.Downgrade;

		logger.info(
			`Renewal with ${isUpgrade ? "upgrade" : "downgrade"}: ${curMainProduct.product.id} -> ${product.id}`,
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
	} else if (curSameProduct) {
		// Reactivate the same product if it was expired/cancelled
		await CusProductService.update({
			db,
			cusProductId: curSameProduct.id,
			updates: {
				status: CusProductStatus.Active,
				canceled_at: null,
				ended_at: null,
				canceled: false,
			},
		});

		logger.info(`Reactivated cus_product: ${curSameProduct.id}`);

		await deleteCachedApiCustomer({
			customerId: customer.id ?? "",
			orgId: org.id,
			env,
		});
		return;
	}

	// Create new cus_product for upgrade or new product
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
		`Created cus_product for ${product.id} with scenario: ${scenario} (renewal)`,
	);

	await deleteCachedApiCustomer({
		customerId: customer.id ?? "",
		orgId: org.id,
		env,
	});
};
