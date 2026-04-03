#!/usr/bin/env bun
import {
	BucketAlreadyExists,
	BucketAlreadyOwnedByYou,
	type BucketLocationConstraint,
	CreateBucketCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import {
	ADMIN_REQUEST_BLOCK_CONFIG_KEY as REQUEST_BLOCK_CONFIG_KEY,
	getAdminS3Config,
} from "@server/external/aws/s3/adminS3Config.js";
const DEFAULT_REQUEST_BLOCK_CONFIG = {
	orgs: {},
};

const getTargetFromArgs = () => {
	const hasDevFlag = process.argv.includes("--dev");
	const hasProdFlag = process.argv.includes("--prod");

	if (hasDevFlag && hasProdFlag) {
		throw new Error("Use either --dev or --prod, not both");
	}

	if (hasDevFlag) return "dev" as const;
	if (hasProdFlag) return "prod" as const;
	return undefined;
};

const createS3Client = ({ region }: { region: string }) => {
	return new S3Client({ region });
};

const getHttpStatusCode = ({ error }: { error: unknown }) => {
	if (!error || typeof error !== "object") return undefined;

	const errorWithMetadata = error as {
		$metadata?: {
			httpStatusCode?: number;
		};
	};

	return errorWithMetadata.$metadata?.httpStatusCode;
};

const isMissingS3ResourceError = ({ error }: { error: unknown }) => {
	if (error instanceof Error) {
		if (error.name === "NotFound" || error.name === "NoSuchBucket") {
			return true;
		}
	}

	return getHttpStatusCode({ error }) === 404;
};

const bucketExists = async ({
	s3Client,
	bucket,
}: {
	s3Client: S3Client;
	bucket: string;
}) => {
	try {
		await s3Client.send(
			new HeadBucketCommand({
				Bucket: bucket,
			}),
		);
		return true;
	} catch (error) {
		if (isMissingS3ResourceError({ error })) {
			return false;
		}

		throw error;
	}
};

const ensureBucketExists = async ({
	s3Client,
	bucket,
	region,
}: {
	s3Client: S3Client;
	bucket: string;
	region: string;
}) => {
	const exists = await bucketExists({ s3Client, bucket });
	if (exists) {
		console.log(`Bucket already exists: ${bucket}`);
		return;
	}

	try {
		await s3Client.send(
			new CreateBucketCommand({
				Bucket: bucket,
				...(region === "us-east-1"
					? {}
					: {
							CreateBucketConfiguration: {
								LocationConstraint: region as BucketLocationConstraint,
							},
						}),
			}),
		);
		console.log(`Created bucket: ${bucket}`);
	} catch (error) {
		if (
			error instanceof BucketAlreadyOwnedByYou ||
			error instanceof BucketAlreadyExists
		) {
			console.log(`Bucket already exists: ${bucket}`);
			return;
		}

		throw error;
	}
};

const objectExists = async ({
	s3Client,
	bucket,
	key,
}: {
	s3Client: S3Client;
	bucket: string;
	key: string;
}) => {
	try {
		await s3Client.send(
			new HeadObjectCommand({
				Bucket: bucket,
				Key: key,
			}),
		);
		return true;
	} catch (error) {
		if (isMissingS3ResourceError({ error })) {
			return false;
		}

		throw error;
	}
};

const ensureRequestBlockConfigExists = async ({
	s3Client,
	bucket,
}: {
	s3Client: S3Client;
	bucket: string;
}) => {
	const exists = await objectExists({
		s3Client,
		bucket,
		key: REQUEST_BLOCK_CONFIG_KEY,
	});

	if (exists) {
		console.log(`Admin config already exists: ${REQUEST_BLOCK_CONFIG_KEY}`);
		return;
	}

	await s3Client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: REQUEST_BLOCK_CONFIG_KEY,
			Body: JSON.stringify(DEFAULT_REQUEST_BLOCK_CONFIG, null, 2),
			ContentType: "application/json",
		}),
	);

	console.log(`Created admin config: ${REQUEST_BLOCK_CONFIG_KEY}`);
};

const main = async () => {
	const target = getTargetFromArgs();
	const { bucket, region } = getAdminS3Config({ target });
	const s3Client = createS3Client({ region });

	console.log(
		`Initializing S3 admin config for ${target || process.env.NODE_ENV || "default"} -> s3://${bucket}/${REQUEST_BLOCK_CONFIG_KEY}`,
	);

	await ensureBucketExists({
		s3Client,
		bucket,
		region,
	});

	await ensureRequestBlockConfigExists({
		s3Client,
		bucket,
	});

	console.log("S3 admin initialization complete.");
};

await main();
