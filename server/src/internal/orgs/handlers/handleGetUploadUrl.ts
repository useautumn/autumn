import { InternalError } from "@autumn/shared";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
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
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org } = ctx;

		const { bucket, region } = getAdminS3Config();
		const key = `${ORG_LOGOS_PREFIX}/${org.id}`;

		if (!bucket || !region) {
			throw new InternalError({
				message: "S3 storage not configured",
				code: "s3_not_configured",
			});
		}

		const signedUrl = await getS3PresignedPutUrl({ bucket, region, key });
		const publicUrl = getOrgLogoPublicUrl({ bucket, region, orgId: org.id });

		return c.json({ signedUrl, publicUrl, key });
	},
});
