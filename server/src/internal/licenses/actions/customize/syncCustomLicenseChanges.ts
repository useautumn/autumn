import type { CustomLicenseChange } from "@autumn/shared";
import { type AutumnBillingPlan, ErrCode, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import {
	clearLicenseCustomize,
	persistLicenseCustomize,
} from "./persistLicenseCustomize.js";
import {
	type ResolvedLicenseAdd,
	resolveLicensePatch,
} from "./resolveLicensePatch.js";

const resolvedAddHasItemRows = async ({
	ctx,
	add,
}: {
	ctx: AutumnContext;
	add: ResolvedLicenseAdd;
}) => {
	if (add.computation) return true;
	if (add.clearItems || !add.existingOverride) return false;
	const itemRows = await licenseItemRepo.listByPlanLicenseIds({
		db: ctx.db,
		planLicenseIds: [add.existingOverride.id],
	});
	return itemRows.entitlements.length > 0 || itemRows.prices.length > 0;
};

const deleteOverrideLink = async ({
	ctx,
	planLicenseId,
}: {
	ctx: AutumnContext;
	planLicenseId: string;
}) => {
	await clearLicenseCustomize({ ctx, planLicenseId });
	await planLicenseRepo.deleteByIds({ db: ctx.db, ids: [planLicenseId] });
};

/** True when the merged override would equal pure catalog inheritance, in
 * which case no override row should exist at all. */
const addMatchesCatalog = async ({
	ctx,
	add,
}: {
	ctx: AutumnContext;
	add: ResolvedLicenseAdd;
}) => {
	if (!add.catalogLink) return false;
	if (add.included !== add.catalogLink.included) return false;
	if (add.prepaidOnly !== add.catalogLink.prepaid_only) return false;
	const catalogMetadata = add.catalogLink.metadata ?? {};
	if (JSON.stringify(add.metadata) !== JSON.stringify(catalogMetadata)) {
		return false;
	}
	return !(await resolvedAddHasItemRows({ ctx, add }));
};

/**
 * Applies a customize license patch: adds upsert customer-scoped overrides
 * (deleting the override entirely when the merged result equals pure catalog
 * inheritance), removes tombstone catalog-inherited licenses (included 0) and
 * delete customer-only overrides. Untouched links are left alone.
 */
const syncCustomLicenseChange = async ({
	ctx,
	change,
}: {
	ctx: AutumnContext;
	change: CustomLicenseChange;
}) => {
	// 1. Setup
	const parentCustomerProduct =
		await planLicenseRepo.getParentCustomerProductById({
			db: ctx.db,
			customerProductId: change.parentCustomerProductId,
		});
	if (!parentCustomerProduct) {
		throw new RecaseError({
			message: `Customer product ${change.parentCustomerProductId} not found.`,
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	const parentProduct = await getFullLicenseProduct({
		ctx,
		idOrInternalId: parentCustomerProduct.internal_product_id,
	});
	// 2. Compute
	const resolved = await resolveLicensePatch({
		ctx,
		adds: change.adds,
		removes: change.removes,
		parentProduct,
		parentCustomerProductId: change.parentCustomerProductId,
	});

	// 3. Execute
	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		const txCtx = { ...ctx, db: txDb };

		for (const add of resolved.adds) {
			if (await addMatchesCatalog({ ctx: txCtx, add })) {
				if (add.existingOverride) {
					await deleteOverrideLink({
						ctx: txCtx,
						planLicenseId: add.existingOverride.id,
					});
				}
				continue;
			}

			const overrideLink = await planLicenseRepo.upsert({
				db: txDb,
				parentInternalProductId: parentCustomerProduct.internal_product_id,
				parentCustomerProductId: change.parentCustomerProductId,
				licenseInternalProductId: add.licenseProduct.internal_id,
				included: add.included,
				prepaidOnly: add.prepaidOnly,
				metadata: add.metadata,
			});
			if (add.computation) {
				await persistLicenseCustomize({
					ctx: txCtx,
					planLicenseId: overrideLink.id,
					computation: add.computation,
				});
			} else if (add.clearItems) {
				await clearLicenseCustomize({
					ctx: txCtx,
					planLicenseId: overrideLink.id,
				});
			}
		}

		for (const remove of resolved.removes) {
			if (remove.catalogLink) {
				const tombstone = await planLicenseRepo.upsert({
					db: txDb,
					parentInternalProductId: parentCustomerProduct.internal_product_id,
					parentCustomerProductId: change.parentCustomerProductId,
					licenseInternalProductId: remove.licenseProduct.internal_id,
					included: 0,
					prepaidOnly: true,
					metadata: {},
				});
				await clearLicenseCustomize({
					ctx: txCtx,
					planLicenseId: tombstone.id,
				});
			} else if (remove.existingOverride) {
				await deleteOverrideLink({
					ctx: txCtx,
					planLicenseId: remove.existingOverride.id,
				});
			}
		}
	});

	// 4. Converge
	await deleteCachedFullCustomer({
		ctx,
		customerId:
			parentCustomerProduct.customer_id ??
			parentCustomerProduct.internal_customer_id,
		source: "license.customize",
	});
};

export const syncCustomLicenseChanges = async ({
	ctx,
	customLicenses,
}: {
	ctx: AutumnContext;
	customLicenses?: AutumnBillingPlan["customLicenses"];
}) => {
	if (!customLicenses?.length) return;

	for (const change of customLicenses) {
		await syncCustomLicenseChange({ ctx, change });
	}
};
