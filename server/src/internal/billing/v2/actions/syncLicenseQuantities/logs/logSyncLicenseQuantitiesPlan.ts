import { customerLicenseToUsage } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { SyncLicenseQuantitiesParams } from "../types.js";

export const logSyncLicenseQuantitiesPlan = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncLicenseQuantitiesParams;
}) => {
	for (const drift of params.licenseQuantityDrifts) {
		const { customerLicense, totalQuantity } = drift;
		const used = customerLicenseToUsage({ customerLicense });

		ctx.logger.info(
			`[syncLicenseQuantities] pool ${customerLicense.link_id}: granted ${customerLicense.granted} -> ${totalQuantity}`,
		);
		// Clamp-only policy: seats stay assigned; the pool self-reports as full
		// (remaining 0) until enough seats release.
		if (used > totalQuantity) {
			ctx.logger.warn(
				`[syncLicenseQuantities] pool ${customerLicense.link_id} over-allocated: ${used} seats in use > ${totalQuantity} granted`,
			);
		}
	}
};
