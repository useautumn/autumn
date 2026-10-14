import { isDeepStrictEqual } from "node:util";
import type {
	CustomizePlanLicense,
	DbPlanLicense,
	FullPlanLicense,
	FullProduct,
	InsertPlanLicenseSpec,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { validateLicenseLink } from "../links/validateLicenseLink.js";
import {
	computeLicenseCustomize,
	derivePlanLicenseItemRefs,
} from "./computeLicenseCustomize.js";

export type CustomPlanLicensesSetup = {
	planLicenses: FullPlanLicense[];
	insertPlanLicenses: InsertPlanLicenseSpec[];
};

const hasCustomizeContent = (entry: CustomizePlanLicense) =>
	entry.customize != null &&
	(entry.customize.price !== undefined ||
		entry.customize.add_items !== undefined ||
		entry.customize.remove_items !== undefined);

const matchesCatalogLink = ({
	entry,
	catalogLink,
}: {
	entry: CustomizePlanLicense;
	catalogLink: FullPlanLicense | undefined;
}) => {
	if (!catalogLink) return false;
	if (hasCustomizeContent(entry)) return false;
	if (entry.included !== undefined && entry.included !== catalogLink.included)
		return false;
	if (
		entry.prepaid_only !== undefined &&
		entry.prepaid_only !== catalogLink.prepaid_only
	)
		return false;
	if (
		entry.metadata !== undefined &&
		!isDeepStrictEqual(entry.metadata, catalogLink.metadata ?? {})
	)
		return false;
	return true;
};

export const setupCustomPlanLicenses = async ({
	ctx,
	parentProduct,
	upsertLicenses,
}: {
	ctx: AutumnContext;
	parentProduct: FullProduct;
	upsertLicenses: CustomizePlanLicense[];
}): Promise<CustomPlanLicensesSetup> => {
	const catalogLinks = parentProduct.licenses ?? [];
	const planLicenses = [...catalogLinks];
	const insertPlanLicenses: InsertPlanLicenseSpec[] = [];

	for (const entry of upsertLicenses) {
		const catalogLink = catalogLinks.find(
			(link) => link.product.id === entry.license_plan_id,
		);
		if (matchesCatalogLink({ entry, catalogLink })) continue;

		const baseProduct: FullProduct =
			catalogLink?.product ??
			(await getFullLicenseProduct({
				ctx,
				idOrInternalId: entry.license_plan_id,
			}));

		const included = entry.included ?? catalogLink?.included ?? 1;
		const prepaidOnly = entry.prepaid_only ?? catalogLink?.prepaid_only ?? true;
		const metadata = entry.metadata ?? catalogLink?.metadata ?? {};

		const customize = entry.customize;
		const computation =
			customize && hasCustomizeContent(entry)
				? await computeLicenseCustomize({
						ctx,
						licenseProduct: baseProduct,
						customize,
					})
				: null;
		const effectiveProduct = computation?.effectiveProduct ?? baseProduct;

		validateLicenseLink({
			parentProduct,
			licenseProduct: effectiveProduct,
			prepaidOnly,
			licensePlanId: entry.license_plan_id,
		});

		const now = Date.now();
		const row: DbPlanLicense = {
			id: generateId("plan_lic"),
			parent_internal_product_id: parentProduct.internal_id,
			license_internal_product_id: baseProduct.internal_id,
			is_custom: true,
			included,
			prepaid_only: prepaidOnly,
			customized: computation !== null,
			metadata,
			created_at: now,
			updated_at: now,
		};

		insertPlanLicenses.push({
			row,
			customPrices: computation?.customPrices ?? [],
			customEntitlements: computation?.customEntitlements ?? [],
			items: computation ? derivePlanLicenseItemRefs(effectiveProduct) : [],
		});

		const overlaid: FullPlanLicense = { ...row, product: effectiveProduct };
		const catalogIndex = catalogLink ? planLicenses.indexOf(catalogLink) : -1;
		if (catalogIndex >= 0) planLicenses[catalogIndex] = overlaid;
		else planLicenses.push(overlaid);
	}

	return { planLicenses, insertPlanLicenses };
};
