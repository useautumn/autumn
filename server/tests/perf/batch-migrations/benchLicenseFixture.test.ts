import { expect, test } from "bun:test";
import chalk from "chalk";
import { derivePlanLicenseItemRefs } from "@/internal/licenses/actions/customize/computeLicenseCustomize.js";
import { getFullLicenseProduct } from "@/internal/licenses/licenseUtils.js";
import {
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "./utils/benchContext.js";
import { ensureBenchLicenseEntitlement } from "./utils/ensureBenchLicenseEntitlement.js";

test(`${chalk.yellowBright("bench fixture: the license product grants a supersedable entitlement")}`, async () => {
	const { ctx } = await getBenchContext();

	await ensureBenchLicenseEntitlement({ ctx });

	const licenseProduct = await getFullLicenseProduct({
		ctx,
		idOrInternalId: BENCH_PAID_PRODUCT_ID,
	});

	const metered = licenseProduct.entitlements.filter(
		(entitlement) => entitlement.allowance !== null,
	);
	expect(metered.length).toBeGreaterThan(0);

	const refs = derivePlanLicenseItemRefs(licenseProduct);
	const supersedable = refs.filter(
		(ref) =>
			ref.entitlementId !== undefined && ref.internalFeatureId !== undefined,
	);
	expect(supersedable.length).toBeGreaterThan(0);
});
