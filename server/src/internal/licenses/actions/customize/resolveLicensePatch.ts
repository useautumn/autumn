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
import {
	computeLicenseCustomize,
	type LicenseCustomizeComputation,
} from "./computeLicenseCustomize.js";

export type ResolvedLicenseAdd = {
	entry: CustomizePlanLicense;
	licenseProduct: FullProduct;
	included: number;
	prepaidOnly: boolean;
	metadata: Record<string, unknown>;
	/** Set when the entry customizes items; null otherwise. */
	computation: LicenseCustomizeComputation | null;
	/** True when the entry passed customize: null to clear items to stock. */
	clearItems: boolean;
	catalogLink?: DbPlanLicense;
	existingOverride?: DbPlanLicense;
};

export type ResolvedLicenseRemove = {
	licensePlanId: string;
	licenseProduct: FullProduct;
	catalogLink?: DbPlanLicense;
	existingOverride?: DbPlanLicense;
};

export type ResolvedLicensePatch = {
	adds: ResolvedLicenseAdd[];
	removes: ResolvedLicenseRemove[];
};

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
	const catalogByLicenseInternalId = new Map(
		catalogLinks.map((link) => [link.license_internal_product_id, link]),
	);
	const overrideByLicenseInternalId = new Map(
		existingOverrides.map((link) => [link.license_internal_product_id, link]),
	);

	const fetchLicenseProduct = (licensePlanId: string) =>
		getFullLicenseProduct({ ctx, idOrInternalId: licensePlanId });

	const resolvedAdds = await Promise.all(
		adds.map(async (entry): Promise<ResolvedLicenseAdd> => {
			const licenseProduct = await fetchLicenseProduct(entry.license_plan_id);
			const catalogLink = catalogByLicenseInternalId.get(
				licenseProduct.internal_id,
			);
			const existingOverride = overrideByLicenseInternalId.get(
				licenseProduct.internal_id,
			);
			const prepaidOnly =
				entry.prepaid_only ?? catalogLink?.prepaid_only ?? true;

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
				prepaidOnly,
				metadata: entry.metadata ?? catalogLink?.metadata ?? {},
				computation,
				clearItems: entry.customize === null,
				catalogLink,
				existingOverride,
			};
		}),
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
			customizeItems: entry.customize?.items ?? undefined,
		});
	}

	const resolvedRemoves = await Promise.all(
		removes.map(async (licensePlanId): Promise<ResolvedLicenseRemove> => {
			const licenseProduct = await fetchLicenseProduct(licensePlanId);
			const catalogLink = catalogByLicenseInternalId.get(
				licenseProduct.internal_id,
			);
			const existingOverride = overrideByLicenseInternalId.get(
				licenseProduct.internal_id,
			);
			if (!(catalogLink || existingOverride)) {
				throw new RecaseError({
					message: `License ${licensePlanId} is not linked to this plan and cannot be removed.`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			return { licensePlanId, licenseProduct, catalogLink, existingOverride };
		}),
	);

	return { adds: resolvedAdds, removes: resolvedRemoves };
};
