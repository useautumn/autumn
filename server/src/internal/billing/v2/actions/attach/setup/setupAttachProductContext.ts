import type {
	AttachParamsV1,
	BillingContextOverride,
	Entitlement,
	FullCustomer,
	FullProduct,
	MultiAttachParamsV0,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import {
	BillingVersion,
	cusProductToProduct,
	isCustomizePlanPatchStyle,
	type PatchContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupPatchContext } from "@/internal/billing/v2/setup/patch";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils";
import { ProductService } from "@/internal/products/ProductService";
import { setupCustomFullProduct } from "../../../setup/setupCustomFullProduct";

const patchContextToFullProduct = ({
	ctx,
	patchContext,
}: {
	ctx: AutumnContext;
	patchContext: PatchContext;
}): FullProduct => {
	const fullProduct = cusProductToProduct({
		cusProduct: patchContext.finalCustomerProduct,
	});

	return {
		...fullProduct,
		prices: [...fullProduct.prices, ...patchContext.customPrices],
		entitlements: getEntsWithFeature({
			ents: [
				...fullProduct.entitlements,
				...(patchContext.customEntitlements as Entitlement[]),
			],
			features: ctx.features,
		}),
	};
};

const setupAttachPatchProductContext = ({
	ctx,
	params,
	fullCustomer,
	fullProduct,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1 | MultiAttachParamsV0["plans"][number];
	fullCustomer: FullCustomer;
	fullProduct: FullProduct;
	currentEpochMs?: number;
}) => {
	if (!isCustomizePlanPatchStyle(params.customize)) return undefined;

	const baseCustomerProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities: [],
			resetCycleAnchor: currentEpochMs ?? Date.now(),
			freeTrial: null,
			now: currentEpochMs ?? Date.now(),
			billingVersion: BillingVersion.V2,
		},
	});

	const patchParams: UpdateSubscriptionV1Params = {
		customer_id: fullCustomer.id ?? fullCustomer.internal_id,
		plan_id: params.plan_id,
		customize: params.customize,
		version: params.version,
	};

	const patchContext = setupPatchContext({
		ctx,
		params: patchParams,
		customerProduct: baseCustomerProduct,
		fullProduct,
	});

	if (!patchContext) return undefined;

	return {
		fullProduct: patchContextToFullProduct({ ctx, patchContext }),
		customPrices: patchContext.customPrices,
		customEnts: patchContext.customEntitlements,
	};
};

const resolveAttachProductContext = async ({
	ctx,
	params,
	fullCustomer,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1 | MultiAttachParamsV0["plans"][number];
	fullCustomer?: FullCustomer;
	currentEpochMs?: number;
}) => {
	const { db, org, env } = ctx;

	// 1. Fetch the product being attached
	const fullProduct = await ProductService.getFull({
		db,
		idOrInternalId: params.plan_id,
		orgId: org.id,
		env,
		version: params.version,
		logResult: true,
		logger: ctx.logger,
	});

	if (fullCustomer) {
		const patchProductContext = setupAttachPatchProductContext({
			ctx,
			params,
			fullCustomer,
			fullProduct,
			currentEpochMs,
		});

		if (patchProductContext) return patchProductContext;
	}

	// 2. Handle custom items if provided
	return await setupCustomFullProduct({
		ctx,
		currentFullProduct: fullProduct,
		customizePlan: params.customize,
	});
};

/**
 * Loads the product being attached, handling version and custom items params.
 */
export const setupAttachProductContext = async ({
	ctx,
	params,
	contextOverride = {},
	fullCustomer,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1 | MultiAttachParamsV0["plans"][number];
	contextOverride?: BillingContextOverride;
	fullCustomer?: FullCustomer;
	currentEpochMs?: number;
}) => {
	const { productContext } = contextOverride;
	if (productContext) return productContext;

	return await resolveAttachProductContext({
		ctx,
		params,
		fullCustomer,
		currentEpochMs,
	});
};
