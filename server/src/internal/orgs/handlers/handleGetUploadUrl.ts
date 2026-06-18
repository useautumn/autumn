import { InternalError, Scopes } from "@autumn/shared";
import { getPublicAssetsS3Config } from "@/external/aws/s3/publicAssetsS3Config.js";
import { getS3PresignedPutUrl } from "@/external/aws/s3/s3PresignUtils.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";

const ORG_LOGOS_PREFIX = "logos";

const getOrgLogoPublicUrl = ({
	bucket,
	region,
	orgId,
}: {
	bucket: string;
	region: string;
	orgId: string;
}) => {
	return `https://${bucket}.s3.${region}.amazonaws.com/${ORG_LOGOS_PREFIX}/${orgId}`;
};

export const handleGetUploadUrl = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org } = ctx;

		const { bucket, region } = getPublicAssetsS3Config();
		const key = `${ORG_LOGOS_PREFIX}/${org.id}`;

		if (!bucket || !region) {
			throw new InternalError({
				message: "Public asset storage not configured",
				code: "s3_not_configured",
			});
		}

		const signedUrl = await getS3PresignedPutUrl({ bucket, region, key });
		const publicUrl = getOrgLogoPublicUrl({ bucket, region, orgId: org.id });

		return c.json({ signedUrl, publicUrl, key });
	},
});
