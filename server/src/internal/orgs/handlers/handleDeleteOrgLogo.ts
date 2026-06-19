import { InternalError, Scopes } from "@autumn/shared";
import {
	getOrgLogoKey,
	getOrgLogoS3Credentials,
	getPublicAssetsS3Config,
} from "@/external/aws/s3/publicAssetsS3Config.js";
import { deleteS3Object } from "@/external/aws/s3/s3PresignUtils.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";

export const handleDeleteOrgLogo = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org } = ctx;

		const { bucket, region } = getPublicAssetsS3Config();

		if (!bucket || !region) {
			throw new InternalError({
				message: "Public asset storage not configured",
				code: "s3_not_configured",
			});
		}

		// S3 DeleteObject is idempotent — a missing object is not an error, so
		// this is safe to call even if the logo was never uploaded.
		await deleteS3Object({
			bucket,
			region,
			key: getOrgLogoKey(org.id),
			credentials: getOrgLogoS3Credentials(),
		});

		return c.json({ success: true });
	},
});
