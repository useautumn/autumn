import { type CustomizePlanLicense, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getLicenseProduct } from "../licenseUtils.js";
import { validatePooledFeatures } from "./validatePooledFeatures.js";

const validateCustomLicenseParams = ({
	licenses,
}: {
	licenses: CustomizePlanLicense[];
}) => {
	const seen = new Set<string>();
	for (const license of licenses) {
		if (seen.has(license.license_plan_id)) {
			throw new RecaseError({
				message: `Duplicate license ${license.license_plan_id}.`,
			});
		}
		if (license.allow_extra_quantity) {
			throw new RecaseError({
				message: "Paid license overages are not supported yet.",
			});
		}
		seen.add(license.license_plan_id);
	}
};

export const resolveDesiredLicenses = async ({
	ctx,
	licenses,
}: {
	ctx: AutumnContext;
	licenses: CustomizePlanLicense[];
}) => {
	validateCustomLicenseParams({ licenses });

	const desired = await Promise.all(
		licenses.map(async (license) => ({
			params: license,
			product: await getLicenseProduct({
				db: ctx.db,
				idOrInternalId: license.license_plan_id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		})),
	);
	for (const { params, product } of desired) {
		validatePooledFeatures({
			ctx,
			pooledFeatureIds: params.pooled_feature_ids ?? [],
			licenseProduct: product,
			customize: params.customize,
		});
	}

	return desired;
};
