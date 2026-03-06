import type {
	AppEnv,
	Entitlement,
	EntitlementWithFeature,
	FullProduct,
	Price,
	Product,
} from "@autumn/shared";
import { entitlements, prices, products } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { logger as loggerType } from "@/external/logtail/logtailUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { invalidateProductsCache } from "@/internal/products/productCacheUtils.js";
import {
	getLatestProducts,
	initProductInStripe,
} from "@/internal/products/productUtils.js";
import { createWorkerContext } from "@/queue/createWorkerContext.js";
import type { JobName } from "@/queue/JobName.js";
import type { Payloads } from "@/queue/queueUtils.js";
import { generateId } from "@/utils/genUtils.js";

/**
 * Build new variant entitlements relative to a (possibly updated) base product.
 * Returns { newVariantEnts, insertEnts, upsertEnts, deleteEntIds } depending on mode.
 */
const buildVariantEnts = ({
	baseEnts,
	oldVariantEnts,
	newVariantInternalId,
	inPlace,
}: {
	baseEnts: FullProduct["entitlements"];
	oldVariantEnts: Entitlement[];
	newVariantInternalId: string;
	/** true = produce insert/upsert/delete sets; false = produce a full new array */
	inPlace: boolean;
}) => {
	const insertEnts: Entitlement[] = [];
	const upsertEnts: Entitlement[] = [];
	const deleteEntIds: string[] = [];
	const allEnts: Entitlement[] = [];

	for (const baseEnt of baseEnts) {
		const oldVariantEnt = oldVariantEnts.find(
			(e) => e.internal_feature_id === baseEnt.internal_feature_id,
		);

		if (!oldVariantEnt) {
			// New base item added after fork — inherit directly
			const newEnt: Entitlement = {
				...baseEnt,
				id: generateId("ent"),
				internal_product_id: newVariantInternalId,
				base_entitlement_id: baseEnt.id,
				variant_action: null,
				is_custom: false,
			};
			if (inPlace) insertEnts.push(newEnt);
			allEnts.push(newEnt);
			continue;
		}

		if (oldVariantEnt.variant_action === "removed") {
			// Preserve the removal
			const removedEnt: Entitlement = {
				...baseEnt,
				id: inPlace ? oldVariantEnt.id : generateId("ent"),
				internal_product_id: newVariantInternalId,
				base_entitlement_id: baseEnt.id,
				variant_action: "removed",
				is_custom: false,
			};
			if (inPlace) upsertEnts.push(removedEnt);
			allEnts.push(removedEnt);
		} else if (oldVariantEnt.variant_action === "override") {
			// Copy variant's own values, update pointer to (new) base ent
			const overrideEnt: Entitlement = {
				...(oldVariantEnt as any),
				id: inPlace ? oldVariantEnt.id : generateId("ent"),
				internal_product_id: newVariantInternalId,
				base_entitlement_id: baseEnt.id,
				is_custom: false,
			} as Entitlement;
			if (inPlace) upsertEnts.push(overrideEnt);
			allEnts.push(overrideEnt);
		} else {
			// Inherited — copy base values
			const inheritedEnt: Entitlement = {
				...baseEnt,
				id: inPlace ? oldVariantEnt.id : generateId("ent"),
				internal_product_id: newVariantInternalId,
				base_entitlement_id: baseEnt.id,
				variant_action: null,
				is_custom: false,
			};
			if (inPlace) upsertEnts.push(inheritedEnt);
			allEnts.push(inheritedEnt);
		}
	}

	// Ents that existed on the old variant but whose feature is no longer in the base
	if (inPlace) {
		for (const oldEnt of oldVariantEnts) {
			if (oldEnt.base_entitlement_id === null) continue; // net-new variant ent, keep
			const stillInBase = baseEnts.some(
				(e) => e.internal_feature_id === oldEnt.internal_feature_id,
			);
			if (!stillInBase) deleteEntIds.push(oldEnt.id!);
		}
	}

	// Net-new variant ents (base_entitlement_id = null — not inherited from base)
	const netNewEnts = oldVariantEnts.filter(
		(e) => e.base_entitlement_id === null,
	);
	for (const ent of netNewEnts) {
		const kept: Entitlement = {
			...(ent as any),
			id: inPlace ? ent.id : generateId("ent"),
			internal_product_id: newVariantInternalId,
			is_custom: false,
		} as Entitlement;
		if (inPlace) upsertEnts.push(kept);
		allEnts.push(kept);
	}

	return { allEnts, insertEnts, upsertEnts, deleteEntIds };
};

/**
 * Build new variant prices relative to a (possibly updated) base product.
 */
const buildVariantPrices = ({
	basePrices,
	baseEnts,
	oldVariantPrices,
	oldVariantEnts,
	newVariantEnts,
	newVariantInternalId,
	inPlace,
}: {
	basePrices: FullProduct["prices"];
	baseEnts: FullProduct["entitlements"];
	oldVariantPrices: Price[];
	oldVariantEnts: Entitlement[];
	newVariantEnts: Entitlement[];
	newVariantInternalId: string;
	inPlace: boolean;
}) => {
	const insertPrices: Price[] = [];
	const upsertPrices: Price[] = [];
	const deletePriceIds: string[] = [];
	const allPrices: Price[] = [];

	for (const basePrice of basePrices) {
		const baseEntForPrice = baseEnts.find(
			(e) => e.id === basePrice.entitlement_id,
		);

		const oldVariantPrice = oldVariantPrices.find((p) => {
			if (!baseEntForPrice) return p.entitlement_id === null;
			const oldVariantEntForPrice = oldVariantEnts.find(
				(e) => e.internal_feature_id === baseEntForPrice.internal_feature_id,
			);
			return p.entitlement_id === oldVariantEntForPrice?.id;
		});

		// Find the new variant ent corresponding to this base price
		const newVariantEntForPrice = newVariantEnts.find(
			(e) => e.base_entitlement_id === basePrice.entitlement_id,
		);

		if (!oldVariantPrice) {
			const newPrice: Price = {
				...basePrice,
				id: generateId("price"),
				internal_product_id: newVariantInternalId,
				base_price_id: basePrice.id,
				variant_action: null,
				is_custom: false,
				entitlement_id: newVariantEntForPrice?.id ?? null,
			};
			if (inPlace) insertPrices.push(newPrice);
			allPrices.push(newPrice);
			continue;
		}

		if (oldVariantPrice.variant_action === "removed") {
			const removedPrice: Price = {
				...basePrice,
				id: inPlace ? oldVariantPrice.id : generateId("price"),
				internal_product_id: newVariantInternalId,
				base_price_id: basePrice.id,
				variant_action: "removed",
				is_custom: false,
				entitlement_id: newVariantEntForPrice?.id ?? null,
			};
			if (inPlace) upsertPrices.push(removedPrice);
			allPrices.push(removedPrice);
		} else if (oldVariantPrice.variant_action === "override") {
			const overridePrice: Price = {
				...(oldVariantPrice as any),
				id: inPlace ? oldVariantPrice.id : generateId("price"),
				internal_product_id: newVariantInternalId,
				base_price_id: basePrice.id,
				entitlement_id: newVariantEntForPrice?.id ?? null,
			} as Price;
			if (inPlace) upsertPrices.push(overridePrice);
			allPrices.push(overridePrice);
		} else {
			const inheritedPrice: Price = {
				...basePrice,
				id: inPlace ? oldVariantPrice.id : generateId("price"),
				internal_product_id: newVariantInternalId,
				base_price_id: basePrice.id,
				variant_action: null,
				is_custom: false,
				entitlement_id: newVariantEntForPrice?.id ?? null,
			};
			if (inPlace) upsertPrices.push(inheritedPrice);
			allPrices.push(inheritedPrice);
		}
	}

	// Prices whose base price no longer exists in the new base
	if (inPlace) {
		for (const oldPrice of oldVariantPrices) {
			if (oldPrice.base_price_id === null) continue; // net-new variant price, keep
			const stillInBase = basePrices.some(
				(p) => p.id === oldPrice.base_price_id,
			);
			if (!stillInBase) deletePriceIds.push(oldPrice.id!);
		}
	}

	// Net-new variant prices (base_price_id = null)
	const netNewPrices = oldVariantPrices.filter((p) => p.base_price_id === null);
	for (const price of netNewPrices) {
		const kept: Price = {
			...(price as any),
			id: inPlace ? price.id : generateId("price"),
			internal_product_id: newVariantInternalId,
		} as Price;
		if (inPlace) upsertPrices.push(kept);
		allPrices.push(kept);
	}

	return { allPrices, insertPrices, upsertPrices, deletePriceIds };
};

export const propagateVariants = async ({
	db,
	payload,
	logger,
}: {
	db: DrizzleCli;
	payload: Payloads[JobName.PropagateVariants];
	logger: ReturnType<typeof loggerType.child>;
}) => {
	const {
		baseProductInternalId,
		newBaseProductInternalId,
		orgId,
		env,
		baseWasVersioned,
	} = payload;

	// Step 1: Find all latest variant versions pinned to the old base
	const allVariants = (await db.query.products.findMany({
		where: and(
			eq(products.internal_parent_product_id, baseProductInternalId),
			eq(products.org_id, orgId),
			eq(products.env, env),
		),
		with: {
			entitlements: {
				with: { feature: true },
				where: eq(entitlements.is_custom, false),
			},
			prices: {
				where: eq(prices.is_custom, false),
			},
			free_trials: {},
		},
	})) as FullProduct[];

	const latestVariants = getLatestProducts(allVariants).filter(
		(p) => p.variant_id !== null,
	);

	if (latestVariants.length === 0) return;

	// Step 2: Fetch the (new) base's ents and prices.
	// For versioned base (Cases A+B), newBaseProductInternalId is the new row.
	// For in-place base (Cases C+D), the base internal_id is unchanged.
	const baseInternalId = baseWasVersioned
		? newBaseProductInternalId!
		: baseProductInternalId;

	const newBase = await ProductService.getFull({
		db,
		idOrInternalId: baseInternalId,
		orgId,
		env,
	});

	// Step 3: Propagate each variant
	for (const variant of latestVariants) {
		try {
			// Fetch old variant's raw ent/price rows — unfiltered (need "removed" rows too)
			const oldVariantEnts = await db.query.entitlements.findMany({
				where: and(
					eq(entitlements.internal_product_id, variant.internal_id),
					eq(entitlements.is_custom, false),
				),
				with: { feature: true },
			});

			const oldVariantPrices = (await db.query.prices.findMany({
				where: and(
					eq(prices.internal_product_id, variant.internal_id),
					eq(prices.is_custom, false),
				),
			})) as Price[];

			if (baseWasVersioned) {
				// ── Cases A + B: base was versioned → always create a new variant row ──
				await propagateVariantVersioned({
					db,
					ctx: { orgId, env, logger },
					variant,
					newBase,
					oldVariantEnts: oldVariantEnts as EntitlementWithFeature[],
					oldVariantPrices,
					minorBump: false,
				});
			} else {
				// ── Cases C + D: base updated in-place → check if variant has customers ──
				const cusProducts = await CusProductService.getByInternalProductId({
					db,
					internalProductId: variant.internal_id,
					limit: 1,
				});

				if (cusProducts.length > 0) {
					// Case C: variant has customers → new version row with minor bump
					await propagateVariantVersioned({
						db,
						ctx: { orgId, env, logger },
						variant,
						newBase,
						oldVariantEnts: oldVariantEnts as EntitlementWithFeature[],
						oldVariantPrices,
						minorBump: true,
					});
				} else {
					// Case D: no customers → update variant ents/prices in-place
					await propagateVariantInPlace({
						db,
						ctx: { orgId, env, logger },
						variant,
						newBase,
						oldVariantEnts: oldVariantEnts as Entitlement[],
						oldVariantPrices,
					});
				}
			}

			logger.info(
				`[propagateVariants] Propagated variant ${variant.variant_id} of plan ${variant.id}`,
			);
		} catch (error: any) {
			logger.error(
				`[propagateVariants] Failed to propagate variant ${variant.variant_id} of plan ${variant.id}: ${error.message}`,
			);
		}
	}

	// Step 4: Invalidate products cache
	await invalidateProductsCache({ orgId, env });
};

/** Cases A+B (and C when variant has customers): insert a new variant product row. */
const propagateVariantVersioned = async ({
	db,
	ctx,
	variant,
	newBase,
	oldVariantEnts,
	oldVariantPrices,
	minorBump,
}: {
	db: DrizzleCli;
	ctx: {
		orgId: string;
		env: AppEnv;
		logger: ReturnType<typeof loggerType.child>;
	};
	variant: FullProduct;
	newBase: FullProduct;
	oldVariantEnts: EntitlementWithFeature[];
	oldVariantPrices: Price[];
	/**
	 * Cases A+B (false): mirror the base's new major version, reset minor_version to variant's current + 1.
	 * Case C (true): keep the variant's own major version, bump minor_version by 1.
	 */
	minorBump: boolean;
}) => {
	const { orgId, env, logger } = ctx;

	// Cases A+B: new base version → variant tracks base's major version, minor starts at existing + 1
	// Case C: base updated in-place, variant has customers → keep variant's major version, increment minor
	const newVersion = minorBump ? variant.version : newBase.version;
	const newMinorVersion = (variant.minor_version ?? 0) + 1;

	const newVariantProduct: Product = {
		id: variant.id,
		name: variant.name,
		description: variant.description ?? null,
		group: variant.group ?? "",
		is_add_on: variant.is_add_on,
		is_default: variant.is_default,
		version: newVersion,
		minor_version: newMinorVersion,
		env: variant.env as AppEnv,
		internal_id: generateId("prod"),
		org_id: variant.org_id,
		created_at: Date.now(),
		processor: variant.processor ?? undefined,
		internal_parent_product_id: newBase.internal_id,
		variant_id: variant.variant_id,
		archived: false,
	};

	await ProductService.insert({ db, product: newVariantProduct });

	const { allEnts: newVariantEnts } = buildVariantEnts({
		baseEnts: newBase.entitlements,
		oldVariantEnts,
		newVariantInternalId: newVariantProduct.internal_id,
		inPlace: false,
	});

	const { allPrices: newVariantPrices } = buildVariantPrices({
		basePrices: newBase.prices,
		baseEnts: newBase.entitlements,
		oldVariantPrices,
		oldVariantEnts,
		newVariantEnts,
		newVariantInternalId: newVariantProduct.internal_id,
		inPlace: false,
	});

	await EntitlementService.insert({ db, data: newVariantEnts });
	await PriceService.insert({ db, data: newVariantPrices });

	const workerCtx = await createWorkerContext({
		db,
		payload: { orgId, env },
		logger,
	});

	if (workerCtx) {
		await initProductInStripe({
			ctx: workerCtx,
			product: {
				...newVariantProduct,
				prices: newVariantPrices.filter((p) => p.variant_action !== "removed"),
				entitlements: newVariantEnts
					.filter((e) => e.variant_action !== "removed")
					.map((e) => ({
						...e,
						feature:
							oldVariantEnts.find(
								(oe) => oe.internal_feature_id === e.internal_feature_id,
							)?.feature ?? null,
					})),
				free_trials: [],
				free_trial: null,
			} as FullProduct,
		});
	}
};

/** Case D: base updated in-place and variant has no customers → update variant ents/prices in-place. */
const propagateVariantInPlace = async ({
	db,
	ctx,
	variant,
	newBase,
	oldVariantEnts,
	oldVariantPrices,
}: {
	db: DrizzleCli;
	ctx: {
		orgId: string;
		env: AppEnv;
		logger: ReturnType<typeof loggerType.child>;
	};
	variant: FullProduct;
	newBase: FullProduct;
	oldVariantEnts: Entitlement[];
	oldVariantPrices: Price[];
}) => {
	const { orgId, env, logger } = ctx;

	const { insertEnts, upsertEnts, deleteEntIds } = buildVariantEnts({
		baseEnts: newBase.entitlements,
		oldVariantEnts,
		newVariantInternalId: variant.internal_id,
		inPlace: true,
	});

	// Build allEnts from insert+upsert so price builder can resolve entitlement_id pointers
	const allEnts = [...insertEnts, ...upsertEnts];

	const { insertPrices, upsertPrices, deletePriceIds } = buildVariantPrices({
		basePrices: newBase.prices,
		baseEnts: newBase.entitlements,
		oldVariantPrices,
		oldVariantEnts,
		newVariantEnts: allEnts,
		newVariantInternalId: variant.internal_id,
		inPlace: true,
	});

	// Apply ents first (prices may reference them)
	await Promise.all([
		EntitlementService.insert({ db, data: insertEnts }),
		EntitlementService.upsert({ db, data: upsertEnts }),
	]);

	await Promise.all([
		PriceService.insert({ db, data: insertPrices }),
		PriceService.upsert({ db, data: upsertPrices }),
		deletePriceIds.length > 0
			? PriceService.deleteInIds({ db, ids: deletePriceIds })
			: Promise.resolve(),
		deleteEntIds.length > 0
			? EntitlementService.deleteInIds({ db, ids: deleteEntIds })
			: Promise.resolve(),
	]);

	// Re-sync Stripe prices for the variant (non-removed rows)
	const workerCtx = await createWorkerContext({
		db,
		payload: { orgId, env },
		logger,
	});

	if (workerCtx) {
		const fullVariant = await ProductService.getFull({
			db,
			idOrInternalId: variant.internal_id,
			orgId,
			env,
		});

		await initProductInStripe({ ctx: workerCtx, product: fullVariant });
	}
};
