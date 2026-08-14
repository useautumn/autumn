/**
 * Guards the precondition benchRunLicenseItemEdit measures against.
 *
 * That benchmark repoints assignments from an entitlement the license plan
 * already grants onto a minted replacement. If the catalog link grants nothing,
 * the seeder plants rows the plan never issued and the run reports
 * "repointed 0, stale N" — a fixture failure that reads as a product bug.
 *
 * Red-failure mode (current behavior):
 *  - the bench license product has no entitlement with an allowance, so
 *    derivePlanLicenseItemRefs yields refs carrying only a priceId and the
 *    supersede has nothing to key on
 *
 * Green-success criteria (after fix):
 *  - the bench license product grants a metered entitlement, and its item refs
 *    carry both entitlementId and internalFeatureId
 */
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
