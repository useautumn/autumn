import {
	type CreateProductV2Params,
	CreateVariantParamsV2Schema,
	ErrCode,
	type Feature,
	type FullProduct,
	Scopes,
	copyStripeResourcesToMatchingPrice,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createProduct } from "../../../product/actions/createProduct.js";
import { ProductService } from "../../ProductService.js";
import { PriceService } from "../../prices/PriceService.js";
import { mapToProductItems } from "../../productV2Utils.js";
import {
	initProductInStripe,
} from "../../productUtils.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";
import RecaseError from "@/utils/errorUtils.js";

export const handleCreateVariantV2 = createRoute({
	scopes: [Scopes.Plans.Write],
	body: CreateVariantParamsV2Schema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const { db, org, env, features } = ctx;

		const base = await ProductService.getFull({
			db,
			idOrInternalId: body.plan_id,
			orgId: org.id,
			env,
		});

		if (base.base_internal_product_id !== null) {
			throw new RecaseError({
				message: "Cannot create a variant from another variant.",
				code: ErrCode.NestedVariantNotAllowed,
				statusCode: 400,
			});
		}

		if (base.archived === true) {
			throw new RecaseError({
				message: "Cannot fork an archived base plan.",
				code: ErrCode.CannotForkArchivedBase,
				statusCode: 400,
			});
		}

		const existing = await ProductService.get({
			db,
			id: body.id,
			orgId: org.id,
			env,
		});

		if (existing) {
			throw new RecaseError({
				message: `Product ${body.id} already exists.`,
				code: ErrCode.ProductIdAlreadyExists,
				statusCode: 409,
			});
		}

		const items = mapToProductItems({
			prices: base.prices,
			entitlements: base.entitlements,
			features,
		}).map((item) => {
			const { entitlement_id, price_id, ...rest } = item;
			return rest;
		});

		const baseFields: Partial<CreateProductV2Params> = {
			description: base.description,
			is_add_on: base.is_add_on,
			group: base.group,
			items: items as CreateProductV2Params["items"],
			free_trial: base.free_trial ?? undefined,
			config: base.config,
			metadata: base.metadata,
		};

		await createProduct({
			ctx,
			data: {
				...baseFields,
				id: body.id,
				name: body.name,
				is_default: false,
				create_in_stripe: false,
				base_internal_product_id: base.internal_id,
			} as CreateProductV2Params & { base_internal_product_id: string },
		});

		const variant: FullProduct = await ProductService.getFull({
			db,
			idOrInternalId: body.id,
			orgId: org.id,
			env,
		});

	for (const targetPrice of variant.prices) {
		const { copiedFields } = copyStripeResourcesToMatchingPrice({
			targetPrice,
			candidatePrices: base.prices,
			targetEntitlements: variant.entitlements,
			candidateEntitlements: base.entitlements,
		});

		if (copiedFields.length > 0) {
			await PriceService.update({
				db,
				id: targetPrice.id,
				update: { config: targetPrice.config },
			});
		}
	}

		await initProductInStripe({ ctx, product: variant });

		return c.json(
			await getPlanResponse({
				ctx,
				product: variant,
				features: ctx.features,
			}),
		);
	},
});
