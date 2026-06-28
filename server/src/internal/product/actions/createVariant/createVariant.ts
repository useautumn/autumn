import {
	type CreateFreeTrial,
	type CreateProductV2Params,
	type CreateVariantParamsV2,
	ErrCode,
	type FullProduct,
	ProcessorType,
	RecaseError,
	billingControlsFromColumns,
	copyStripeResourcesToMatchingPrice,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import { createProduct } from "../createProduct.js";

const getVariantItems = ({
	base,
	features,
}: {
	base: FullProduct;
	features: AutumnContext["features"];
}): CreateProductV2Params["items"] =>
	mapToProductItems({
		prices: base.prices,
		entitlements: base.entitlements,
		features,
	}).map((item) => {
		const { entitlement_id, price_id, ...rest } = item;
		return rest;
	}) as CreateProductV2Params["items"];

const getCreateFreeTrial = ({
	base,
}: {
	base: FullProduct;
}): CreateFreeTrial | null => {
	if (!base.free_trial) return null;

	return {
		length: base.free_trial.length,
		duration: base.free_trial.duration,
		unique_fingerprint: base.free_trial.unique_fingerprint,
		card_required: base.free_trial.card_required,
		on_end: base.free_trial.on_end,
	};
};

const getVariantCreateParams = ({
	base,
	data,
	features,
}: {
	base: FullProduct;
	data: CreateVariantParamsV2;
	features: AutumnContext["features"];
}): CreateProductV2Params => ({
	id: data.variant_plan_id,
	name: data.name,
	description: base.description,
	is_add_on: base.is_add_on,
	is_default: false,
	group: base.group,
	items: getVariantItems({ base, features }),
	free_trial: getCreateFreeTrial({ base }),
	config: base.config,
	billing_controls: billingControlsFromColumns(base),
	metadata: base.metadata,
	create_in_stripe: false,
	base_internal_product_id: base.internal_id,
});

const copyBaseStripeResourcesToVariant = async ({
	ctx,
	base,
	variant,
}: {
	ctx: AutumnContext;
	base: FullProduct;
	variant: FullProduct;
}) => {
	if (
		base.processor?.type === ProcessorType.Stripe &&
		base.processor.id &&
		variant.processor?.id !== base.processor.id
	) {
		variant.processor = base.processor;
		await ProductService.updateByInternalId({
			db: ctx.db,
			internalId: variant.internal_id,
			update: { processor: base.processor },
		});
	}

	for (const targetPrice of variant.prices) {
		const { copiedFields } = copyStripeResourcesToMatchingPrice({
			targetPrice,
			candidatePrices: base.prices,
			targetEntitlements: variant.entitlements,
			candidateEntitlements: base.entitlements,
		});

		if (copiedFields.length > 0) {
			await PriceService.update({
				db: ctx.db,
				id: targetPrice.id,
				update: { config: targetPrice.config },
			});
		}
	}
};

export const createVariant = async ({
	ctx,
	data,
	initialBaseProduct,
}: {
	ctx: AutumnContext;
	data: CreateVariantParamsV2;
	initialBaseProduct?: FullProduct;
}) => {
	const { db, org, env, features } = ctx;

	const base =
		initialBaseProduct ??
		(await ProductService.getFull({
			db,
			idOrInternalId: data.base_plan_id,
			orgId: org.id,
			env,
		}));

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
		id: data.variant_plan_id,
		orgId: org.id,
		env,
	});

	if (existing) {
		throw new RecaseError({
			message: `Product ${data.variant_plan_id} already exists.`,
			code: ErrCode.ProductIdAlreadyExists,
			statusCode: 409,
		});
	}

	await createProduct({
		ctx,
		data: getVariantCreateParams({ base, data, features }),
	});

	const variant = await ProductService.getFull({
		db,
		idOrInternalId: data.variant_plan_id,
		orgId: org.id,
		env,
	});

	await copyBaseStripeResourcesToVariant({
		ctx,
		base,
		variant,
	});

	await initProductInStripe({ ctx, product: variant });

	return variant;
};
