const publicBucket = process.env.S3_PUBLIC_BUCKET || "autumn-public-assets";
// makes S3 301-redirect the presigned PUT, which surfaces as a CORS error.
const publicRegion = process.env.S3_PUBLIC_REGION || "us-east-2";

export const getPublicAssetsS3Config = () => {
	return {
		bucket: publicBucket,
		region: publicRegion,
	};
};

const ORG_LOGOS_PREFIX = "logos";

export const getOrgLogoKey = (orgId: string) => `${ORG_LOGOS_PREFIX}/${orgId}`;

export const getOrgLogoPublicUrl = ({
	bucket,
	region,
	orgId,
}: {
	bucket: string;
	region: string;
	orgId: string;
}) => `https://${bucket}.s3.${region}.amazonaws.com/${getOrgLogoKey(orgId)}`;

export const getOrgLogoS3Credentials = () => {
	const accessKeyId = process.env.ORG_LOGO_S3_KEY;
	const secretAccessKey = process.env.ORG_LOGO_S3_SECRET;

	if (!accessKeyId || !secretAccessKey) {
		return;
	}

	return { accessKeyId, secretAccessKey };
};
