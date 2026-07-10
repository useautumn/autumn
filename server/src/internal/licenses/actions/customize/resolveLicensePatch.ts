import {
	type CustomizePlanLicense,
	type DbPlanLicense,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { validateLicenseLink } from "../links/validateLicenseLink.js";
import { computeLicenseCustomize } from "./computeLicenseCustomize.js";
import type {
	ResolvedLicenseAdd,
	ResolvedLicensePatch,
	ResolvedLicenseRemove,
} from "./types.js";

type LinkMap = Map<string, DbPlanLicense>;

const validateLicensePatchIds = ({
	adds,
	removes,
}: {
	adds: CustomizePlanLicense[];
	removes: string[];
}) => {
	const addIds = new Set<string>();
	for (const entry of adds) {
		if (addIds.has(entry.license_plan_id)) {
			throw new RecaseError({
				message: `Duplicate license ${entry.license_plan_id} in add_licenses.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		addIds.add(entry.license_plan_id);
	}
	const removeIds = new Set<string>();
	for (const licensePlanId of removes) {
		if (removeIds.has(licensePlanId)) {
			throw new RecaseError({
				message: `Duplicate license ${licensePlanId} in remove_licenses.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		removeIds.add(licensePlanId);
		if (addIds.has(licensePlanId)) {
			throw new RecaseError({
				message: `License ${licensePlanId} cannot appear in both add_licenses and remove_licenses.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};

/** Fetches the license product and its catalog/override links for one entry. */
const resolveLicenseLinks = async ({
	ctx,
	licensePlanId,
	catalogByLicenseInternalId,
	overrideByLicenseInternalId,
	pinnedInternalIdByPublicId,
}: {
	ctx: AutumnContext;
	licensePlanId: string;
	catalogByLicenseInternalId: LinkMap;
	overrideByLicenseInternalId: LinkMap;
	pinnedInternalIdByPublicId: Map<string, string>;
}) => {
	// Existing links keep their pinned version; only new links resolve to latest.
	const licenseProduct = await getFullLicenseProduct({
		ctx,
		idOrInternalId:
			pinnedInternalIdByPublicId.get(licensePlanId) ?? licensePlanId,
	});
	return {
		licenseProduct,
		catalogLink: catalogByLicenseInternalId.get(licenseProduct.internal_id),
		existingOverride: overrideByLicenseInternalId.get(
			licenseProduct.internal_id,
		),
	};
};

/** Resolves one add entry: fetches its links, applies catalog-inheritance
 * fallbacks, and materializes any item customize. */
const resolveAddEntry = async ({
	ctx,
	entry,
	catalogByLicenseInternalId,
	overrideByLicenseInternalId,
	pinnedInternalIdByPublicId,
}: {
	ctx: AutumnContext;
	entry: CustomizePlanLicense;
	catalogByLicenseInternalId: LinkMap;
	overrideByLicenseInternalId: LinkMap;
	pinnedInternalIdByPublicId: Map<string, string>;
}): Promise<ResolvedLicenseAdd> => {
	const { licenseProduct, catalogLink, existingOverride } =
		await resolveLicenseLinks({
			ctx,
			licensePlanId: entry.license_plan_id,
			catalogByLicenseInternalId,
			overrideByLicenseInternalId,
			pinnedInternalIdByPublicId,
		});
	const computation = entry.customize?.items
		? await computeLicenseCustomize({
				ctx,
				licenseProduct,
				items: entry.customize.items,
			})
		: null;

	return {
		entry,
		licenseProduct,
		included: entry.included ?? catalogLink?.included ?? 1,
		prepaidOnly: entry.prepaid_only ?? catalogLink?.prepaid_only ?? true,
		metadata: entry.metadata ?? catalogLink?.metadata ?? {},
		computation,
		clearItems: entry.customize === null,
		catalogLink,
		existingOverride,
	};
};

/** Resolves one remove entry: a license must be linked (catalog or override)
 * to be removable. */
const resolveRemoveEntry = async ({
	ctx,
	licensePlanId,
	catalogByLicenseInternalId,
	overrideByLicenseInternalId,
	pinnedInternalIdByPublicId,
}: {
	ctx: AutumnContext;
	licensePlanId: string;
	catalogByLicenseInternalId: LinkMap;
	overrideByLicenseInternalId: LinkMap;
	pinnedInternalIdByPublicId: Map<string, string>;
}): Promise<ResolvedLicenseRemove> => {
	const { licenseProduct, catalogLink, existingOverride } =
		await resolveLicenseLinks({
			ctx,
			licensePlanId,
			catalogByLicenseInternalId,
			overrideByLicenseInternalId,
			pinnedInternalIdByPublicId,
		});
	if (!(catalogLink || existingOverride)) {
		throw new RecaseError({
			message: `License ${licensePlanId} is not linked to this plan and cannot be removed.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return { licensePlanId, licenseProduct, catalogLink, existingOverride };
};

/**
 * Resolves a customize license patch (add_licenses / remove_licenses) against
 * the parent's catalog links and any existing customer overrides. Shared by
 * the pre-billing validate phase and the execute phase.
 *
 * Omitted add fields inherit the catalog link (included defaults to 1 when
 * the license is not in the catalog), so a bare entry resolves to pure
 * catalog inheritance. parentProduct enables interval parity checks; when the
 * parent cannot be resolved (legacy persisted plans) those checks are skipped.
 */
export const resolveLicensePatch = async ({
	ctx,
	adds = [],
	removes = [],
	parentProduct,
	parentCustomerProductId,
}: {
	ctx: AutumnContext;
	adds?: CustomizePlanLicense[];
	removes?: string[];
	parentProduct?: FullProduct;
	parentCustomerProductId?: string;
}): Promise<ResolvedLicensePatch> => {
	validateLicensePatchIds({ adds, removes });

	const [catalogLinks, existingOverrides] = await Promise.all([
		parentProduct
			? planLicenseRepo.listCatalogByParentInternalProductIds({
					db: ctx.db,
					parentInternalProductIds: [parentProduct.internal_id],
				})
			: Promise.resolve([]),
		parentCustomerProductId
			? planLicenseRepo.listCustomerByParentCustomerProductIds({
					db: ctx.db,
					parentCustomerProductIds: [parentCustomerProductId],
				})
			: Promise.resolve([]),
	]);
	const catalogByLicenseInternalId: LinkMap = new Map(
		catalogLinks.map((link) => [link.license_internal_product_id, link]),
	);
	const overrideByLicenseInternalId: LinkMap = new Map(
		existingOverrides.map((link) => [link.license_internal_product_id, link]),
	);
	const linkedProducts = await planLicenseRepo.listProductsByInternalIds({
		db: ctx.db,
		internalProductIds: [
			...catalogLinks.map((link) => link.license_internal_product_id),
			...existingOverrides.map((link) => link.license_internal_product_id),
		],
	});
	const pinnedInternalIdByPublicId = new Map(
		linkedProducts.map((product) => [product.id, product.internal_id]),
	);

	const resolvedAdds = await Promise.all(
		adds.map((entry) =>
			resolveAddEntry({
				ctx,
				entry,
				catalogByLicenseInternalId,
				overrideByLicenseInternalId,
				pinnedInternalIdByPublicId,
			}),
		),
	);

	for (const {
		entry,
		licenseProduct,
		computation,
		prepaidOnly,
	} of resolvedAdds) {
		validateLicenseLink({
			parentProduct,
			licenseProduct: computation?.effectiveProduct ?? licenseProduct,
			prepaidOnly,
			licensePlanId: entry.license_plan_id,
		});
	}

	const resolvedRemoves = await Promise.all(
		removes.map((licensePlanId) =>
			resolveRemoveEntry({
				ctx,
				licensePlanId,
				catalogByLicenseInternalId,
				overrideByLicenseInternalId,
				pinnedInternalIdByPublicId,
			}),
		),
	);

	return { adds: resolvedAdds, removes: resolvedRemoves };
};
