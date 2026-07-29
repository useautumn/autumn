import type {
	AttachParamsV1,
	Entitlement,
	FullProduct,
	InsertPlanLicenseSpec,
	MultiAttachParamsV0,
	Price,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupCustomPlanLicenses } from "@/internal/licenses/actions/customize/setupCustomPlanLicenses";

export type ProductContextWithLicenses = {
	fullProduct: FullProduct;
	customPrices: Price[];
	customEnts: Entitlement[];
	insertPlanLicenses?: InsertPlanLicenseSpec[];
};

/** Overlays the customize license fields (upsert_licenses today) onto a
 * resolved product context so pool init, billing, and seat provisioning all
 * see the effective definitions. Action-agnostic. */
export const setupCustomizeLicenses = async ({
	ctx,
	customize,
	productContext,
}: {
	ctx: AutumnContext;
	customize:
		| AttachParamsV1["customize"]
		| MultiAttachParamsV0["plans"][number]["customize"];
	productContext: ProductContextWithLicenses;
}): Promise<ProductContextWithLicenses> => {
	const upsertLicenses =
		customize && "upsert_licenses" in customize
			? customize.upsert_licenses
			: undefined;
	if (!upsertLicenses?.length) return productContext;

	const customPlanLicenses = await setupCustomPlanLicenses({
		ctx,
		parentProduct: productContext.fullProduct,
		upsertLicenses,
	});

	return {
		...productContext,
		fullProduct: {
			...productContext.fullProduct,
			licenses: customPlanLicenses.planLicenses,
		},
		insertPlanLicenses: customPlanLicenses.insertPlanLicenses,
	};
};
