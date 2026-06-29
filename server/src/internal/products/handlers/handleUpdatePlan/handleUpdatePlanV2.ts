import {
	AffectedResource,
	apiPlan,
	Scopes,
	UpdatePlanParamsV2Schema,
	type UpdateProductV2Params,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateProduct } from "../../../product/actions/updateProduct.js";
import {
	createPlanMigrationDraft,
	getVariantMigrationSnapshots,
	validateNoDirectVariantMigrationDrafts,
} from "../../../product/actions/updateProduct/createPlanMigrationDraft.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleUpdatePlanV2 = createRoute({
	scopes: [Scopes.Plans.Write],
	body: UpdatePlanParamsV2Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");

		const {
			plan_id,
			new_plan_id,
			force_version,
			disable_version,
			all_versions,
			migration,
			version,
			update_variant_ids,
			variants,
			...planParams
		} = body;
		const ctx = c.get("ctx");

		const initialFullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: plan_id,
			orgId: ctx.org.id,
			env: ctx.env,
			version,
		});

		const updateProductV2Params = apiPlan.map.paramsV1ToProductV2({
			ctx,
			currentFullProduct: initialFullProduct,
			params: {
				id: new_plan_id,
				...planParams,
			},
		}) as UpdateProductV2Params;
		const fromPlan =
			migration?.draft && (disable_version || all_versions)
				? await getPlanResponse({
						ctx,
						product: initialFullProduct,
						features: ctx.features,
					})
				: null;
		const variantUpdates = variants ?? [];
		const selectedVariantIds = [
			...new Set([
				...(update_variant_ids ?? []),
				...variantUpdates.map((variant) => variant.variant_plan_id),
			]),
		];
		const variantsBefore =
			fromPlan && selectedVariantIds.length > 0
				? await getVariantMigrationSnapshots({
						ctx,
						variantIds: selectedVariantIds,
					})
				: [];
		validateNoDirectVariantMigrationDrafts({
			hasMigrationDraft: Boolean(fromPlan),
			variantUpdates,
			variantsBefore,
		});

		await updateProduct({
			ctx,
			productId: plan_id,
			query: { version, force_version, disable_version, all_versions },
			updates: updateProductV2Params,
			initialFullProduct,
			propagateToVariants: update_variant_ids ?? [],
			variantUpdates,
		});

		const latestPlanId = new_plan_id || plan_id;
		let responseFullProduct = null;
		let migrationId: string | undefined;
		if (fromPlan) {
			const after = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: latestPlanId,
				orgId: ctx.org.id,
				env: ctx.env,
				version: initialFullProduct.version,
			});
			if (after) {
				if (version === undefined) responseFullProduct = after;
				const toPlan = await getPlanResponse({
					ctx,
					product: after,
					features: ctx.features,
				});
				migrationId = await createPlanMigrationDraft({
					ctx,
					current: initialFullProduct,
					fromPlan,
					includeCustom: migration?.include_custom,
					mode: all_versions ? "all_versions" : "version",
					planId: plan_id,
					selectedVariantIds,
					toPlan,
					variantsBefore,
				});
			}
		}

		// Fetch the latest version (no `version` pin): when a new version was
		// created, newBase must be it — not the version that was edited.
		const latestFullProduct =
			responseFullProduct ??
			(await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: latestPlanId,
				orgId: ctx.org.id,
				env: ctx.env,
			}));

		const latestPlan = await getPlanResponse({
			product: latestFullProduct,
			features: ctx.features,
		});

		return c.json(
			migrationId
				? { ...latestPlan, migration: { id: migrationId } }
				: latestPlan,
		);
	},
});
