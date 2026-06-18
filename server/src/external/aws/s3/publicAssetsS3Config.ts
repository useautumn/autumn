// Public, unauthenticated-readable assets (e.g. org logos rendered on the
// dashboard). This is a DIFFERENT bucket from the admin/private one in
// adminS3Config.ts — that bucket has public access blocked and holds private
// data. Objects here are served directly via their public URL with no signing.
const publicBucket = process.env.S3_PUBLIC_BUCKET || "autumn-public-assets";
const publicRegion =
	process.env.S3_PUBLIC_REGION || process.env.S3_REGION || "us-east-2";

export const getPublicAssetsS3Config = () => {
	return {
		bucket: publicBucket,
		region: publicRegion,
	};
};

// Dedicated, least-privilege IAM user scoped to s3:PutObject on
// autumn-public-assets/logos/*. The presigned upload URL is signed with these
// credentials, so the signer must hold that permission. When unset (e.g. local
// dev), the S3 client falls back to the default AWS credential provider chain.
export const getOrgLogoS3Credentials = () => {
	const accessKeyId = process.env.ORG_LOGO_S3_KEY;
	const secretAccessKey = process.env.ORG_LOGO_S3_SECRET;

	if (!accessKeyId || !secretAccessKey) {
		return;
	}

	return { accessKeyId, secretAccessKey };
};
