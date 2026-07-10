import {
	type CustomizePlanLicense,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import {
	computeLicenseCustomize,
	type LicenseCustomizeComputation,
} from "../customize/computeLicenseCustomize.js";
import {
	clearLicenseCustomize,
	persistLicenseCustomize,
} from "../customize/persistLicenseCustomize.js";
import { logLicenseAction } from "../logs/logLicenseAction.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

type ResolvedLink = {
	entry: CustomizePlanLicense;
	licenseProduct: FullProduct;
	included: number;
	prepaidOnly: boolean;
	computation: LicenseCustomizeComputation | null;
	clearItems: boolean;
};

/** Resolves one incoming link entry against the license product, validating it
 * and materializing any customize — a pure-ish read step before the writes. */
const resolveLink = async ({
	ctx,
	parentProduct,
	entry,
	pinnedInternalIdByPublicId,
}: {
	ctx: AutumnContext;
	parentProduct: FullProduct;
	entry: CustomizePlanLicense;
	pinnedInternalIdByPublicId: Map<string, string>;
}): Promise<ResolvedLink> => {
	// Existing links keep their pinned version; only new links resolve to latest.
	const licenseProduct = await getFullLicenseProduct({
		ctx,
		idOrInternalId:
			pinnedInternalIdByPublicId.get(entry.license_plan_id) ??
			entry.license_plan_id,
	});
	const normalizedCustomize = entry.customize?.items?.length
		? entry.customize
		: null;
	const computation = normalizedCustomize?.items
		? await computeLicenseCustomize({
				ctx,
				licenseProduct,
				items: normalizedCustomize.items,
			})
		: null;

	validateLicenseLink({
		parentProduct,
		licenseProduct: computation?.effectiveProduct ?? licenseProduct,
		prepaidOnly: entry.prepaid_only ?? true,
		licensePlanId: entry.license_plan_id,
	});

	return {
		entry,
		licenseProduct,
		included: entry.included ?? 0,
		prepaidOnly: entry.prepaid_only ?? true,
		computation,
		clearItems: entry.customize === null,
	};
};

/** Guards a link removal or capacity reduction against active assignments —
 * a plan cannot drop below what customers are already using. */
const assertCapacityAllowed = async ({
	ctx,
	parentInternalProductId,
	licenseInternalProductId,
	licensePlanId,
	included,
}: {
	ctx: AutumnContext;
	parentInternalProductId: string;
	licenseInternalProductId: string;
	licensePlanId: string;
	included: number;
}) => {
	const maxAssigned = await licenseAssignmentRepo.maxActiveCountByCatalogLink({
		db: ctx.db,
		parentInternalProductId,
		licenseInternalProductId,
	});
	if (maxAssigned > included) {
		throw new RecaseError({
			message: `Cannot set included to ${included}: a customer has ${maxAssigned} active assignments for ${licensePlanId}. Unassign licenses first.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

/**
 * Declaratively syncs a plan's catalog license links to `licenses`: the array
 * is the complete set — links absent from it are removed (guarded against
 * active assignments), present ones are upserted with their customize. No-op
 * when `licenses` is undefined (the field was not part of the update).
 */
export const syncPlanLicenses = async ({
	ctx,
	parentProduct,
	licenses,
}: {
	ctx: AutumnContext;
	parentProduct: FullProduct;
	licenses?: CustomizePlanLicense[];
}) => {
	if (licenses === undefined) return;

	const existingLinks =
		await planLicenseRepo.listCatalogByParentInternalProductIds({
			db: ctx.db,
			parentInternalProductIds: [parentProduct.internal_id],
		});
	const existingLinkProducts = await planLicenseRepo.listProductsByInternalIds({
		db: ctx.db,
		internalProductIds: existingLinks.map(
			(link) => link.license_internal_product_id,
		),
	});
	const pinnedInternalIdByPublicId = new Map(
		existingLinkProducts.map((product) => [product.id, product.internal_id]),
	);

	const resolved = await Promise.all(
		licenses.map((entry) =>
			resolveLink({ ctx, parentProduct, entry, pinnedInternalIdByPublicId }),
		),
	);
	const keepInternalIds = new Set(
		resolved.map((link) => link.licenseProduct.internal_id),
	);

	// Removals + capacity reductions must clear the active-assignment guard.
	const removed = existingLinks.filter(
		(link) => !keepInternalIds.has(link.license_internal_product_id),
	);
	await Promise.all(
		removed.map(async (link) => {
			const licenseProduct = await getFullLicenseProduct({
				ctx,
				idOrInternalId: link.license_internal_product_id,
			});
			await assertCapacityAllowed({
				ctx,
				parentInternalProductId: parentProduct.internal_id,
				licenseInternalProductId: link.license_internal_product_id,
				licensePlanId: licenseProduct.id,
				included: 0,
			});
		}),
	);
	const reducedLinks = resolved.filter((link) => {
		const existing = existingLinks.find(
			(row) =>
				row.license_internal_product_id === link.licenseProduct.internal_id,
		);
		return existing !== undefined && link.included < existing.included;
	});
	await Promise.all(
		reducedLinks.map((link) =>
			assertCapacityAllowed({
				ctx,
				parentInternalProductId: parentProduct.internal_id,
				licenseInternalProductId: link.licenseProduct.internal_id,
				licensePlanId: link.licenseProduct.id,
				included: link.included,
			}),
		),
	);

	logLicenseAction({
		ctx,
		action: "link",
		details: {
			parent: parentProduct.id,
			links: resolved.length,
			removed: removed.length,
		},
	});

	await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as DrizzleCli };
		for (const link of resolved) {
			const upserted = await planLicenseRepo.upsert({
				db: txCtx.db,
				parentInternalProductId: parentProduct.internal_id,
				licenseInternalProductId: link.licenseProduct.internal_id,
				included: link.included,
				prepaidOnly: link.prepaidOnly,
				metadata: link.entry.metadata,
			});
			if (link.computation) {
				await persistLicenseCustomize({
					ctx: txCtx,
					planLicenseId: upserted.id,
					computation: link.computation,
				});
			} else if (link.clearItems) {
				await clearLicenseCustomize({ ctx: txCtx, planLicenseId: upserted.id });
			}
		}
		if (removed.length > 0) {
			await planLicenseRepo.deleteByIds({
				db: txCtx.db,
				ids: removed.map((link) => link.id),
			});
		}
	});
};
