import {
	AllowanceType,
	type AppEnv,
	AttachScenario,
	CusProductStatus,
	type EntitlementWithFeature,
	type FeatureOptions,
	type FullCustomer,
	type FullCustomerEntitlement,
	getStartingBalance,
	type Organization,
	type Price,
} from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { triggerVerifyCacheConsistency } from "@/internal/billing/v2/workflows/verifyCacheConsistency/triggerVerifyCacheConsistency.js";
import { getEntRelatedPrice } from "@/internal/products/entitlements/entitlementUtils.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { nullish } from "@/utils/genUtils.js";
import type { InsertCusProductParams } from "../cusProducts/AttachParams.js";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { CusEntService } from "../cusProducts/cusEnts/CusEntitlementService.js";
import { initCusEntitlement } from "./initCusEnt.js";

const updateOneOffExistingEntitlement = async ({
	ctx,
	cusEnt,
	entitlement,
	org,
	env,
	options,
	relatedPrice,
}: {
	ctx: RepoContext;
	cusEnt: FullCustomerEntitlement;
	entitlement: EntitlementWithFeature;
	org: Organization;
	env: AppEnv;
	options?: FeatureOptions;
	relatedPrice?: Price;
}) => {
	const { db, logger } = ctx;
	if (entitlement.allowance_type === AllowanceType.Unlimited) {
		return;
	}

	//  Fetch to get latest entitlement
	const updatedCusEnt = await CusEntService.getStrict({
		db,
		id: cusEnt.id,
		orgId: org.id,
		env: env,
	});

	const resetBalance = getStartingBalance({
		entitlement,
		options,
		relatedPrice,
	});

	if (nullish(resetBalance)) {
		logger.warn(
			"Tried updating one off entitlement, no reset balance, entitlement: ",
		);
		logger.warn(entitlement);
		return;
	}

	await CusEntService.update({
		ctx,
		id: updatedCusEnt.id,
		updates: {
			balance: updatedCusEnt.balance! + resetBalance!,
		},
	});

	return;
};

export const updateOneTimeCusProduct = async ({
	ctx,
	attachParams,
}: {
	ctx: RepoContext;
	attachParams: InsertCusProductParams;
}) => {
	// 1. Sort cus products by created_at
	attachParams.cusProducts?.sort((a, b) => b.created_at - a.created_at);

	// 2. Get existing same cus product and customer entitlements
	const existingCusProduct = attachParams.cusProducts?.find(
		(cp) =>
			cp.product.internal_id === attachParams.product.internal_id &&
			cp.status === CusProductStatus.Active,
	);

	if (!existingCusProduct) {
		// logger.warn("No existing cus product found", {
		// 	data: {
		// 		attachParams,
		// 	},
		// });
		return;
	}

	const existingCusEnts = existingCusProduct?.customer_entitlements || [];

	// 3. Update existing entitlements
	for (const entitlement of attachParams.entitlements) {
		const existingCusEnt = existingCusEnts.find(
			(ce) => ce.internal_feature_id === entitlement.internal_feature_id,
		);

		const relatedPrice = getEntRelatedPrice(entitlement, attachParams.prices);
		const options = getEntOptions(attachParams.optionsList, entitlement);

		if (existingCusEnt) {
			await updateOneOffExistingEntitlement({
				ctx,
				cusEnt: existingCusEnt,
				entitlement,
				org: attachParams.org,
				env: attachParams.customer.env,
				options: options || undefined,
				relatedPrice,
			});
		} else {
			const newCusEnt = initCusEntitlement({
				entitlement,
				customer: attachParams.customer,
				cusProductId: existingCusProduct.id,
				options: undefined,
				nextResetAt: undefined,
				freeTrial: null,
				relatedPrice,
				replaceables: [],
				entities: attachParams.entities || [],
			});

			console.log("Inserting new cus ent");
			await CusEntService.insert({
				ctx,
				data: [newCusEnt as any],
			});
		}
	}

	// Update options on full cus product
	const newOptionsList = [...attachParams.optionsList];

	for (const curOptions of existingCusProduct.options) {
		// Find the option in the new options list
		const newOptionIndex = newOptionsList.findIndex(
			(o) => o.internal_feature_id === curOptions.internal_feature_id,
		);

		if (newOptionIndex !== -1) {
			newOptionsList[newOptionIndex] = {
				...newOptionsList[newOptionIndex],
				quantity:
					(newOptionsList[newOptionIndex].quantity || 0) +
					(curOptions.quantity || 0),
			};
		}
	}

	await CusProductService.update({
		ctx,
		cusProductId: existingCusProduct.id,
		updates: {
			options: newOptionsList,
			quantity: existingCusProduct.quantity + 1,
		},
	});

	// Send webhook
	const { customer, org } = attachParams;
	await addProductsUpdatedWebhookTask({
		ctx: attachParams.req,
		internalCustomerId: customer.internal_id,
		org,
		env: customer.env,
		customerId: customer.id || null,
		cusProduct: existingCusProduct,
		scheduledCusProduct: undefined,
		scenario: AttachScenario.New,
	});

	await triggerVerifyCacheConsistency({
		newCustomerProduct: existingCusProduct,
		previousFullCustomer: attachParams.customer as FullCustomer,
		logger: ctx.logger,
		source: "updateOneTimeCusProduct",
	});
};
