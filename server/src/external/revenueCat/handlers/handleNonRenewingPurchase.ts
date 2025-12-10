import type { WebhookNonRenewingPurchase } from "@puzzmo/revenue-cat-webhook-types";
import {
	type AppEnv,
	AttachScenario,
	type Feature,
	type Organization,
	ProcessorType,
} from "@shared/index";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { Logger } from "@/external/logtail/logtailUtils.js";
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
	const [product, customer] = await Promise.all([
		ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: event.product_id,
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
			productId: event.product_id,
		});
		return;
	}

	if (!oneOffOrAddOn({ product, prices: product.prices })) {
		logger.error("Non-renewing purchase is not a one-off or add-on", {
			productId: event.product_id,
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
