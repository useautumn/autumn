import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { logLicenseAction } from "@/internal/licenses/actions/logs/logLicenseAction.js";
import type { ReleaseLicenseContext } from "../types.js";

export const logReleaseLicensePlan = ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: ReleaseLicenseContext;
}) => {
	const { fullCustomer, releases } = context;
	logLicenseAction({
		ctx,
		action: "release",
		details: {
			customer: fullCustomer.id ?? fullCustomer.internal_id,
			entities: context.entityIds.length,
			pools: new Set(
				releases.map(({ customerLicense }) => customerLicense.link_id),
			).size,
		},
	});
};
