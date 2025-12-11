import type { WebhookNonRenewingPurchase } from "@puzzmo/revenue-cat-webhook-types";
import {
	type AppEnv,
	AttachScenario,
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
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { ProductService } from "@/internal/products/ProductService";
import { attachToInsertParams } from "@/internal/products/productUtils";
import { oneOffOrAddOn } from "@/internal/products/productUtils/classifyProduct";

export const handleNonRenewingPurchase = async ({
	event,
	db,
	org,
	env,
	logger,
	features,
}: {
	event: WebhookNonRenewingPurchase;
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
		logger.error("No Autumn product mapped to RevenueCat product", {
			revcatProductId: event.product_id,
		});
		return;
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
		logger.error("Product not found", {
			productId: autumnProductId,
		});
		return;
	}

	if (!oneOffOrAddOn({ product, prices: product.prices })) {
		logger.error("Non-renewing purchase is not a one-off or add-on", {
			productId: autumnProductId,
		});
		return;
	}

	if (!customer) {
		logger.error("Customer not found", {
			customerId: event.app_user_id,
		});
		return;
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

	const now = Date.now();
	const scenario = AttachScenario.New;

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
