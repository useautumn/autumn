import {
	AttachScenario,
	Entity,
	ErrCode,
	FeatureType,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import { createFullCusProduct } from "../../add-product/createFullCusProduct.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { cusProductToProduct } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
	getRelatedCusPrice,
	getResetBalance,
} from "../../cusProducts/cusEnts/cusEntUtils.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { CusEntService } from "../../cusProducts/cusEnts/CusEntitlementService.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";

export const handleDecreaseAndTransfer = async ({
	req,
	fullCus,
	cusProduct,
	toEntity,
}: {
	req: ExtendedRequest;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	toEntity: Entity;
}) => {
	// 1. Create new cus product for entity...
	const { org, env } = req;
	const stripeCli = createStripeCli({ org, env });
	const product = cusProductToProduct({ cusProduct });

	// Decrease quantity of cus product...

	const batchDecrement = [];
	for (const cusEnt of cusProduct.customer_entitlements) {
		const feature = cusEnt.entitlement.feature;
		if (feature.type == FeatureType.Boolean) continue;

		const cusPrice = getRelatedCusPrice(cusEnt, cusProduct.customer_prices);

		const options = getEntOptions(cusProduct.options, cusEnt.entitlement);
		const resetBalance = getResetBalance({
			entitlement: cusEnt.entitlement,
			options: options,
			relatedPrice: cusPrice?.price,
		});

		batchDecrement.push(
			CusEntService.decrement({
				db: req.db,
				id: cusEnt.id,
				amount: resetBalance,
			}),
		);
	}

	await Promise.all(batchDecrement);

	await CusProductService.update({
		db: req.db,
		cusProductId: cusProduct.id,
		updates: {
			quantity: cusProduct.quantity - 1,
		},
	});

	const newCusProduct = await createFullCusProduct({
		db: req.db,
		logger: req.logger,
		trialEndsAt: cusProduct.trial_ends_at || undefined,
		subscriptionIds: cusProduct.subscription_ids || [],
		attachParams: attachToInsertParams(
			{
				req,
				customer: fullCus,
				products: [product],
				prices: product.prices,
				entitlements: product.entitlements,
				org: req.org,
				stripeCli: stripeCli,
				paymentMethod: null,
				freeTrial: cusProduct.free_trial || null,
				optionsList: cusProduct.options,
				scenario: AttachScenario.New,
				// scenario: AttachScenario.New,

				cusProducts: fullCus.customer_products,
				replaceables: [],
				entities: fullCus.entities,
				features: req.features,
				internalEntityId: toEntity.internal_id,
				entityId: toEntity.id,
			},
			product,
		),
		scenario: AttachScenario.New,
	});
};
