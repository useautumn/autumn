import type { WebhookRenewal } from "@puzzmo/revenue-cat-webhook-types";
import {
	ACTIVE_STATUSES,
	AttachScenario,
	CusProductStatus,
	cusProductToPrices,
	ProcessorType,
} from "@shared/index";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { resolveRevenuecatResources } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";
import {
	attachToInsertParams,
	isProductUpgrade,
} from "@/internal/products/productUtils";
import { isMainProduct } from "@/internal/products/productUtils/classifyProduct";

export const handleRenewal = async ({
	event,
	ctx,
}: {
	event: WebhookRenewal;
	ctx: AutumnContext;
}) => {
	const { db, org, env, logger, features } = ctx;
	const { product_id, app_user_id } = event;

	const { product, customer, cusProducts } = await resolveRevenuecatResources({
		ctx,
		revenuecatProductId: product_id,
		customerId: app_user_id,
	});

	const { curSameProduct, curMainProduct } = getExistingCusProducts({
		product,
		cusProducts,
	});

	const now = Date.now();

	// If same product exists and is active, this is just a renewal - nothing to do
	if (curSameProduct && ACTIVE_STATUSES.includes(curSameProduct.status)) {
		logger.info(
			`Renewal for existing active product ${product.id}, no action needed`,
		);
		return { success: true };
	} else if (curSameProduct && curSameProduct.status === CusProductStatus.PastDue) {
		logger.info(
			`Renewal for existing past due product ${product.id}, marking as active`,
		);
		await CusProductService.update({
			db,
			cusProductId: curSameProduct.id,
			updates: {
				status: CusProductStatus.Active,
			},
		});
		logger.info(`Marked past due product as active: ${curSameProduct.id}`);
		await deleteCachedApiCustomer({
			customerId: customer.id ?? "",
			orgId: org.id,
			env,
		});
		return { success: true };
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
		return { success: true };
	}

	// Create new cus_product for upgrade or new product
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
		`Created cus_product for ${product.id} with scenario: ${scenario} (renewal)`,
	);

	await deleteCachedApiCustomer({
		customerId: customer.id ?? "",
		orgId: org.id,
		env,
	});

	return { success: true };
};
