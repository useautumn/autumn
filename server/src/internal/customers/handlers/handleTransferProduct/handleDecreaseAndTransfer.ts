import {
	AttachScenario,
	cusProductToProduct,
	type Entity,
	FeatureType,
	type FullCusProduct,
	type FullCustomer,
	getStartingBalance,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { createFullCusProduct } from "../../add-product/createFullCusProduct.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";
import { CusEntService } from "../../cusProducts/cusEnts/CusEntitlementService.js";
import { getRelatedCusPrice } from "../../cusProducts/cusEnts/cusEntUtils.js";

export const handleDecreaseAndTransfer = async ({
	ctx,
	fullCus,
	cusProduct,
	toEntity,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	cusProduct: FullCusProduct;
	toEntity: Entity;
}) => {
	// 1. Create new cus product for entity...
	const { org, env, db, logger, features } = ctx;
	const stripeCli = createStripeCli({ org, env });
	const product = cusProductToProduct({ cusProduct });

	// Decrease quantity of cus product...

	const batchDecrement = [];
	for (const cusEnt of cusProduct.customer_entitlements) {
		const feature = cusEnt.entitlement.feature;
		if (feature.type === FeatureType.Boolean) continue;

		const cusPrice = getRelatedCusPrice(cusEnt, cusProduct.customer_prices);

		const options = getEntOptions(cusProduct.options, cusEnt.entitlement);
		const resetBalance = getStartingBalance({
			entitlement: cusEnt.entitlement,
			options: options || undefined,
			relatedPrice: cusPrice?.price,
		});

		batchDecrement.push(
			CusEntService.decrement({
				db,
				id: cusEnt.id,
				amount: resetBalance,
			}),
		);
	}

	await Promise.all(batchDecrement);

	await CusProductService.update({
		db,
		cusProductId: cusProduct.id,
		updates: {
			quantity: cusProduct.quantity - 1,
		},
	});

	await createFullCusProduct({
		db,
		logger,
		trialEndsAt: cusProduct.trial_ends_at || undefined,
		subscriptionIds: cusProduct.subscription_ids || [],
		attachParams: attachToInsertParams(
			{
				req: ctx as any, // Pass ctx as req for now (AttachParams still uses req)
				customer: fullCus,
				products: [product],
				prices: product.prices,
				entitlements: product.entitlements,
				org,
				stripeCli: stripeCli,
				paymentMethod: null,
				freeTrial: cusProduct.free_trial || null,
				optionsList: cusProduct.options,
				scenario: AttachScenario.New,

				cusProducts: fullCus.customer_products,
				replaceables: [],
				entities: fullCus.entities,
				features,
				internalEntityId: toEntity.internal_id,
				entityId: toEntity.id,
			},
			product,
		),
		scenario: AttachScenario.New,
	});
};
