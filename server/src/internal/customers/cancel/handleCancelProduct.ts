import {
	AttachBranch,
	CusProductStatus,
	cusProductToProduct,
	type EntitlementWithFeature,
	type FullCusProduct,
	type FullCustomer,
	type Price,
	ProrationBehavior,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { getCusPaymentMethod } from "../../../external/stripe/stripeCusUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { handleRenewProduct } from "../attach/attachFunctions/handleRenewProduct.js";
import { handleScheduleFunction2 } from "../attach/attachFunctions/scheduleFlow/handleScheduleFlow2.js";
import { handleUpgradeFlow } from "../attach/attachFunctions/upgradeFlow/handleUpgradeFlow.js";
import { getDefaultAttachConfig } from "../attach/attachUtils/getAttachConfig.js";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { getExistingCusProducts } from "../cusProducts/cusProductUtils/getExistingCusProducts.js";
import {
	activateDefaultProduct,
	getDefaultProduct,
} from "../cusProducts/cusProductUtils.js";

export const handleCancelProduct = async ({
	ctx,
	cusProduct, // cus product to expire
	fullCus,
	expireImmediately = true,
	prorate,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
	fullCus: FullCustomer;
	expireImmediately: boolean;
	prorate: boolean;
}) => {
	const { org, env, logger, features } = ctx;
	logger.info("--------------------------------");
	logger.info(
		`🔔 Expiring cutomer product (${
			expireImmediately ? "immediately" : "end of cycle"
		})`,
	);
	logger.info(
		`Customer: ${fullCus.id || fullCus.internal_id} (${env}), Org: ${org.id}`,
	);
	logger.info(
		`Product: ${cusProduct.product.name}, Status: ${cusProduct.status}`,
	);

	const stripeCli = createStripeCli({ org, env });

	// 1. Build attach params
	if (cusProduct.status === CusProductStatus.Scheduled) {
		const { curMainProduct } = getExistingCusProducts({
			product: cusProduct.product,
			cusProducts: fullCus.customer_products,
			internalEntityId: cusProduct.internal_entity_id,
		});
		const product = cusProductToProduct({ cusProduct: curMainProduct! });

		await handleRenewProduct({
			ctx,
			attachParams: {
				stripeCli,
				customer: fullCus,
				org,
				cusProducts: fullCus.customer_products,
				products: [product],
				internalEntityId: cusProduct.internal_entity_id || undefined,
				paymentMethod: null,
				prices: product.prices,
				entitlements: product.entitlements,
				freeTrial: product.free_trial || null,
				optionsList: curMainProduct?.options || [],
				replaceables: [],
				entities: fullCus.entities,
				features,
			},
			config: getDefaultAttachConfig(),
		});
		return;
	}

	// 2. If there's a scheduled product, throw error?
	const isMain = !cusProduct.product.is_add_on;
	const product = cusProductToProduct({ cusProduct });
	const isFree = isFreeProduct(product.prices || []);

	if (isMain) {
		// Delete scheduled product
		const { curScheduledProduct } = getExistingCusProducts({
			product: product,
			cusProducts: fullCus.customer_products,
			internalEntityId: cusProduct.internal_entity_id,
		});

		console.log(
			`Current scheduled product: ${curScheduledProduct?.product.name}`,
		);

		// Delete scheduled product.
		if (curScheduledProduct) {
			await CusProductService.delete({
				db: ctx.db,
				cusProductId: curScheduledProduct?.id,
			});
		}
	}

	// 2. If expire at cycle end, just cancel subscriptions
	if (!expireImmediately && !isFree) {
		const defaultProduct = await getDefaultProduct({
			ctx,
			productGroup: product.group,
		});

		let products = [product];
		let prices: Price[] = [];
		let entitlements: EntitlementWithFeature[] = [];
		let skipInsertCusProduct = true;
		if (
			!isFreeProduct(product.prices) &&
			!product.is_add_on &&
			defaultProduct
		) {
			products = [defaultProduct];
			prices = defaultProduct.prices;
			entitlements = defaultProduct.entitlements;
			skipInsertCusProduct = false;
		}

		await handleScheduleFunction2({
			ctx,
			attachParams: {
				stripeCli,
				customer: fullCus,
				org,
				cusProducts: fullCus.customer_products,
				products,
				internalEntityId: cusProduct.internal_entity_id || undefined,
				paymentMethod: null,
				prices,
				entitlements,
				freeTrial: null,
				optionsList: [],
				replaceables: [],
				entities: fullCus.entities,
				features,
				fromCancel: true,
			},
			config: getDefaultAttachConfig(),
			skipInsertCusProduct,
		});

		// Schedule default product...

		return;
	}

	const paymentMethod = await getCusPaymentMethod({
		stripeCli,
		stripeId: fullCus.processor?.id,
	});

	// Cancel product immediately
	await handleUpgradeFlow({
		ctx,
		attachParams: {
			stripeCli,
			customer: fullCus,
			org,
			cusProduct,
			cusProducts: fullCus.customer_products,
			products: [],
			internalEntityId: cusProduct.internal_entity_id || undefined,
			paymentMethod,
			prices: [],
			entitlements: [],
			freeTrial: null,
			optionsList: [],
			replaceables: [],
			entities: fullCus.entities,
			features,
			fromCancel: true,
		},
		config: {
			...getDefaultAttachConfig(),
			proration: prorate
				? ProrationBehavior.Immediately
				: ProrationBehavior.None,
			requirePaymentMethod: false,
		},
		branch: AttachBranch.Cancel,
	});

	// Activate default product
	if (!product.is_add_on && !isOneOff(product.prices)) {
		await activateDefaultProduct({
			ctx,
			productGroup: cusProduct.product.group,
			fullCus,
			curCusProduct: cusProduct,
		});
	}
};
