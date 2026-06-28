import {
	ApiVersion,
	ApiVersionClass,
	apiPlan,
	buildMigrationDraft,
	type CatalogUpdateParams,
	type CreateProductV2Params,
	dbToApiFeatureV1,
	diffPlanV1,
	featureV1ToDbFeature,
	type MigrationDraft,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";
import { getObjectsUsingFeature } from "@/internal/features/utils/updateFeatureUtils/getObjectsUsingFeature.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { deleteProduct } from "@/internal/product/actions/deleteProduct.js";
import { updateProduct } from "@/internal/product/actions/updateProduct.js";
import { updateVariants } from "@/internal/product/actions/updateVariants/updateVariants.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import {
	deriveReplaceFeatureIds,
	deriveReplacePlanIds,
} from "../deriveReplaceRemovals.js";
import { sortRemoveFeatureIds } from "../featureRemovalOrder.js";
import { getFeatureUpdateBlockedReason } from "../previewUpdateCatalog/previewFeature.js";

const archiveProductVersions = async ({
	ctx,
	productId,
}: {
	ctx: AutumnContext;
	productId: string;
}) => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [productId],
		returnAll: true,
	});

	for (const product of products) {
		await ProductService.updateByInternalId({
			db: ctx.db,
			internalId: product.internal_id,
			update: { archived: true },
		});
	}
};

const upsertFeatures = async ({
	ctx,
	params,
	products,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
	products: Awaited<ReturnType<typeof ProductService.listFull>>;
}) => {
	const { db, org, env } = ctx;
	let changed = false;

	for (const feature of params.features) {
		const existing = await FeatureService.get({
			db,
			orgId: org.id,
			env,
			id: feature.feature_id,
		});
		const dbFeature = featureV1ToDbFeature({
			apiFeature: { id: feature.feature_id, ...feature },
			originalFeature: existing ?? undefined,
		});

		if (existing) {
			const blockedReason = await getFeatureUpdateBlockedReason({
				ctx,
				existing,
				updates: dbFeature,
				products,
			});
			if (blockedReason !== null) continue;

			await updateFeature({
				ctx,
				featureId: feature.feature_id,
				updates: dbFeature,
			});
		} else {
			await createFeature({ ctx, data: dbFeature });
		}

		changed = true;
	}

	if (changed) {
		ctx.features = await FeatureService.list({ db, orgId: org.id, env });
	}
};

const upsertPlans = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}) => {
	const { db, org, env } = ctx;
	const migrations: MigrationDraft[] = [];

	for (const planParams of params.plans) {
		const {
			plan_id,
			new_plan_id,
			disable_version,
			force_version,
			propagate_to_variants,
			version,
			...rest
		} = planParams;
		const current = await ProductService.getFull({
			db,
			idOrInternalId: plan_id,
			orgId: org.id,
			env,
			version,
			allowNotFound: true,
		});

		if (!current) {
			const createParams = apiPlan.map.paramsV1ToProductV2({
				ctx,
				params: {
					id: plan_id,
					...rest,
					add_on: rest.add_on ?? false,
					auto_enable: rest.auto_enable ?? false,
				},
			}) as CreateProductV2Params;
			await createProduct({ ctx, data: createParams });
			continue;
		}

		const hasPlanUpdateValue = ([key, value]: [string, unknown]) => {
			if (value === undefined) return false;
			if (key === "create_in_stripe") return false;
			if (key === "archived" && value === current.archived) return false;
			if (key === "group" && value === (current.group ?? "")) return false;
			if (key === "description" && value === (current.description ?? null)) {
				return false;
			}
			if (key === "add_on" && value === current.is_add_on) return false;
			if (key === "auto_enable" && value === current.is_default) return false;
			if (key === "is_default" && value === current.is_default) return false;
			return true;
		};
		const hasPlanUpdate =
			new_plan_id !== undefined ||
			Object.entries(rest).some(hasPlanUpdateValue);
		if (!hasPlanUpdate) continue;

		const fromPlan =
			params.create_migration && disable_version
				? await getPlanResponse({
						ctx,
						product: current,
						features: ctx.features,
					})
				: null;

		const updateParams = apiPlan.map.paramsV1ToProductV2({
			ctx,
			currentFullProduct: current,
			params: { id: new_plan_id ?? plan_id, ...rest },
		}) as UpdateProductV2Params;
		await updateProduct({
			ctx,
			productId: plan_id,
			query: { version, disable_version, force_version },
			updates: updateParams,
			initialFullProduct: current,
		});

		const latestPlanId = new_plan_id ?? plan_id;
		const latestFullProduct = await ProductService.getFull({
			db,
			idOrInternalId: latestPlanId,
			orgId: org.id,
			env,
		});
		const propagateToVariants = propagate_to_variants ?? [];
		if (propagateToVariants.length > 0) {
			await updateVariants({
				ctx,
				oldBase: current,
				newBase: latestFullProduct,
				propagateToVariants,
			});
		}

		if (!fromPlan) continue;

		const after = await ProductService.getFull({
			db,
			idOrInternalId: latestPlanId,
			orgId: org.id,
			env,
			version: current.version,
		});
		const toPlan = await getPlanResponse({
			ctx,
			product: after,
			features: ctx.features,
		});
		const cusProducts = await CusProductService.getByInternalProductId({
			db,
			internalProductId: current.internal_id,
		});
		const hasDiff =
			Object.keys(diffPlanV1({ from: fromPlan, to: toPlan })).length > 0;
		if (cusProducts.length > 0 && hasDiff) {
			const draft = buildMigrationDraft({
				from: fromPlan,
				to: toPlan,
				planId: plan_id,
				version: current.version,
				scope: "all_customers",
			});
			await migrationRepo.insert({ ctx, insert: draft });
			migrations.push(draft);
		}
	}

	return migrations;
};

const applyMissingPlanRemovals = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	for (const planId of planIds) {
		const counts = await CusProdReadService.getCountsForAllVersions({
			db: ctx.db,
			productId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		if (Number(counts?.all ?? 0) > 0) {
			await archiveProductVersions({ ctx, productId: planId });
		} else {
			await deleteProduct({
				ctx,
				productId: planId,
				allVersions: true,
			});
		}
	}
};

const applyMissingFeatureRemovals = async ({
	ctx,
	featureIds,
}: {
	ctx: AutumnContext;
	featureIds: string[];
}) => {
	let latestProducts = featureIds.length
		? await ProductService.listFull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				returnAll: true,
			})
		: [];

	for (const featureId of sortRemoveFeatureIds({
		features: ctx.features,
		featureIds,
	})) {
		const feature = ctx.features.find((candidate) => candidate.id === featureId);
		if (!feature) continue;

		const objectsUsingFeature = await getObjectsUsingFeature({
			ctx,
			feature,
			products: latestProducts,
		});
		const hasDependency =
			objectsUsingFeature.creditSystems.length > 0 ||
			objectsUsingFeature.entitlements.length > 0 ||
			objectsUsingFeature.prices.length > 0 ||
			objectsUsingFeature.cusEnts.length > 0;

		if (hasDependency) {
			await FeatureService.update({
				db: ctx.db,
				id: featureId,
				orgId: ctx.org.id,
				env: ctx.env,
				updates: { archived: true },
			});
			ctx.features = ctx.features.map((candidate) =>
				candidate.id === featureId
					? { ...candidate, archived: true }
					: candidate,
			);
		} else {
			await FeatureService.delete({
				db: ctx.db,
				orgId: ctx.org.id,
				featureId,
				env: ctx.env,
			});
			ctx.features = ctx.features.filter(
				(candidate) => candidate.id !== featureId,
			);
		}

		latestProducts = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			returnAll: true,
		});
	}
};

const resolveCatalogUpdateResponse = async ({
	ctx,
	params,
	migrations,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
	migrations: MigrationDraft[];
}) => {
	const { db, org, env } = ctx;
	const resolvedPlans = await Promise.all(
		params.plans.map(async (planParams) => {
			const product = await ProductService.getFull({
				db,
				idOrInternalId: planParams.new_plan_id ?? planParams.plan_id,
				orgId: org.id,
				env,
				allowNotFound: true,
			});
			return product
				? getPlanResponse({ ctx, product, features: ctx.features })
				: null;
		}),
	);

	const resolvedFeatures = await Promise.all(
		params.features.map(async (feature) => {
			const dbFeature = await FeatureService.get({
				db,
				orgId: org.id,
				env,
				id: feature.feature_id,
			});
			return dbFeature
				? dbToApiFeatureV1({
						ctx,
						dbFeature,
						targetVersion: new ApiVersionClass(ApiVersion.V2_1),
					})
				: null;
		}),
	);

	return {
		plans: resolvedPlans.filter((plan) => plan !== null),
		features: resolvedFeatures.filter((feature) => feature !== null),
		migrations,
	};
};

export const updateCatalog = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}) => {
	const { db, org, env } = ctx;
	const productsBeforeUpdate = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
	});
	const replacePlanIds = params.skip_deletions
		? []
		: deriveReplacePlanIds({ products: productsBeforeUpdate, plans: params.plans });

	await upsertFeatures({ ctx, params, products: productsBeforeUpdate });
	const migrations = await upsertPlans({ ctx, params });
	await applyMissingPlanRemovals({ ctx, planIds: replacePlanIds });

	const replaceFeatureIds = params.skip_deletions
		? []
		: deriveReplaceFeatureIds({
				features: ctx.features,
				desiredFeatures: params.features,
			});
	await applyMissingFeatureRemovals({ ctx, featureIds: replaceFeatureIds });

	return resolveCatalogUpdateResponse({ ctx, params, migrations });
};
