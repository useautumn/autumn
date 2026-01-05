import type { WebhookNonRenewingPurchase } from "@puzzmo/revenue-cat-webhook-types";
import {
	AttachScenario,
	ErrCode,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import { attachToInsertParams } from "@/internal/products/productUtils";
import { oneOffOrAddOn } from "@/internal/products/productUtils/classifyProduct";

export const handleNonRenewingPurchase = async ({
	event,
	ctx,
}: {
	event: WebhookNonRenewingPurchase;
	ctx: AutumnContext;
}) => {
	const { db, org, env, logger, features } = ctx;

	const { product, customer, cusProducts } = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: event.product_id,
		customerId: event.app_user_id,
	});

	if (!oneOffOrAddOn({ product, prices: product.prices })) {
		throw new RecaseError({
			message: "Non-renewing purchase is not a one-off or add-on",
			code: ErrCode.InvalidProductItem,
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
		source: `handleRevenuecatNonRenewingPurchase: ${product.id}`,
	});
};
