import { InternalError, Scopes } from "@autumn/shared";
import {
	getOrgLogoKey,
	getOrgLogoPublicUrl,
	getOrgLogoS3Credentials,
	getPublicAssetsS3Config,
} from "@/external/aws/s3/publicAssetsS3Config.js";
import { getS3PresignedPutUrl } from "@/external/aws/s3/s3PresignUtils.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";

export const handleGetUploadUrl = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org } = ctx;

		const { bucket, region } = getPublicAssetsS3Config();
		const key = getOrgLogoKey(org.id);

		if (!bucket || !region) {
			throw new InternalError({
				message: "Public asset storage not configured",
				code: "s3_not_configured",
			});
		}

		const signedUrl = await getS3PresignedPutUrl({
			bucket,
			region,
			key,
			credentials: getOrgLogoS3Credentials(),
		});
		const publicUrl = getOrgLogoPublicUrl({ bucket, region, orgId: org.id });

		return c.json({ signedUrl, publicUrl, key });
	},
});
