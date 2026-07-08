import {
	type ApiPlanV1,
	type CreatePlanItemParamsV1,
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type Entitlement,
	type FullProduct,
	type Price,
	type ProductV2,
	productV2ToApiPlanV1,
	toCreatePlanItemParams,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupCustomFullProduct } from "@/internal/billing/v2/setup/setupCustomFullProduct.js";
import { insertCustomItems } from "@/internal/customers/attach/attachUtils/insertCustomItems.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { mapToProductV2 } from "@/internal/products/productV2Utils.js";
import type { LicenseItemRows } from "../../repos/licenseItemRepo.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";

export type LicenseCustomizeComputation = {
	effectiveProduct: FullProduct;
	customPrices: Price[];
	customEntitlements: Entitlement[];
};

/** Shared serialization pipeline: ProductV2 → API plan → create-item params. */
export const productToCreatePlanItems = ({
	ctx,
	productV2,
}: {
	ctx: AutumnContext;
	productV2: ProductV2;
}): CreatePlanItemParamsV1[] =>
	productV2ToApiPlanV1({
		product: productV2,
		features: ctx.features,
		currency: ctx.org.default_currency ?? "USD",
	}).items.map(toCreatePlanItemParams);

const effectiveProductFromItems = ({
	ctx,
	licenseProduct,
	itemRows,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	itemRows: LicenseItemRows;
}): FullProduct => {
	if (itemRows.entitlements.length === 0 && itemRows.prices.length === 0) {
		return licenseProduct;
	}
	return {
		...licenseProduct,
		prices: itemRows.prices as unknown as FullProduct["prices"],
		entitlements: getEntsWithFeature({
			ents: itemRows.entitlements as Entitlement[],
			features: ctx.features,
		}),
	};
};

/**
 * Compute the customized license product from input items (replace-set).
 * Pure — nothing is persisted; the split marks which rows are new is_custom
 * overrides vs live base rows carried by reference.
 */
export const computeLicenseCustomize = async ({
	ctx,
	licenseProduct,
	items,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	items: CreatePlanItemParamsV1[];
}): Promise<LicenseCustomizeComputation> => {
	const custom = await setupCustomFullProduct({
		ctx,
		currentFullProduct: licenseProduct,
		customizePlan: { items },
	});
	return {
		effectiveProduct: custom.fullProduct,
		customPrices: custom.customPrices as Price[],
		customEntitlements: custom.customEnts as Entitlement[],
	};
};

/**
 * Persist a link's customization cusProduct-style: only changed rows are
 * inserted as is_custom; untouched items stay references to live base rows,
 * so base edits keep propagating. Item replace-set = removal by absence.
 */
export const persistLicenseCustomize = async ({
	ctx,
	planLicenseId,
	computation,
}: {
	ctx: AutumnContext;
	planLicenseId: string;
	computation: LicenseCustomizeComputation;
}) => {
	const { effectiveProduct, customPrices, customEntitlements } = computation;
	const priceReferencedEntitlementIds = new Set(
		effectiveProduct.prices
			.map((price) => price.entitlement_id)
			.filter((id): id is string => Boolean(id)),
	);
	const items = [
		...effectiveProduct.prices.map((price) => ({
			entitlementId: price.entitlement_id ?? undefined,
			priceId: price.id,
		})),
		...effectiveProduct.entitlements
			.filter((ent) => !priceReferencedEntitlementIds.has(ent.id))
			.map((ent) => ({ entitlementId: ent.id })),
	];
	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		if (customPrices.length > 0 || customEntitlements.length > 0) {
			await insertCustomItems({
				db: txDb,
				customPrices,
				customEnts: customEntitlements,
			});
		}
		await licenseItemRepo.replaceItems({
			db: txDb,
			planLicenseId,
			items,
		});
	});
};

/** Clears a link's items back to stock (live base rows). */
export const clearLicenseCustomize = async ({
	ctx,
	planLicenseId,
}: {
	ctx: AutumnContext;
	planLicenseId: string;
}) => {
	await ctx.db.transaction(async (tx) => {
		await licenseItemRepo.replaceItems({
			db: tx as unknown as DrizzleCli,
			planLicenseId,
			items: [],
		});
	});
};

/**
 * The link's effective product: its item rows (base + is_custom mix) when
 * customized, the license product itself otherwise.
 */
export const resolveEffectiveLicenseProduct = async ({
	ctx,
	licenseProduct,
	planLicenseId,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	planLicenseId: string;
}): Promise<FullProduct> => {
	const itemRows = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: [planLicenseId],
	});
	return effectiveProductFromItems({ ctx, licenseProduct, itemRows });
};

const productToApiPlan = ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}): ApiPlanV1 =>
	productV2ToApiPlanV1({
		product: mapToProductV2({ product, features: ctx.features }),
		features: ctx.features,
		currency: ctx.org.default_currency ?? "USD",
	});

/** Derived `customize` diff over already-loaded item rows: null when stock. */
export const deriveCustomizeFromItems = ({
	ctx,
	licenseProduct,
	itemRows,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	itemRows: LicenseItemRows;
}): DiffedCustomizePlanV1 | null => {
	const effective = effectiveProductFromItems({
		ctx,
		licenseProduct,
		itemRows,
	});
	if (effective === licenseProduct) return null;

	const diff = diffPlanV1({
		from: productToApiPlan({ ctx, product: licenseProduct }),
		to: productToApiPlan({ ctx, product: effective }),
	});
	return Object.keys(diff).length === 0 ? null : diff;
};

/** Derived `customize` diff for API responses: null when stock. */
export const deriveLicenseCustomize = async ({
	ctx,
	licenseProduct,
	planLicenseId,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	planLicenseId: string;
}): Promise<DiffedCustomizePlanV1 | null> => {
	const itemRows = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: [planLicenseId],
	});
	return deriveCustomizeFromItems({ ctx, licenseProduct, itemRows });
};
