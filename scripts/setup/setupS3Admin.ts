#!/usr/bin/env bun
import {
	BucketAlreadyExists,
	BucketAlreadyOwnedByYou,
	type BucketLocationConstraint,
	CreateBucketCommand,
	GetBucketLifecycleConfigurationCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	type LifecycleRule,
	PutBucketLifecycleConfigurationCommand,
	PutObjectCommand,
	S3Client,
	type TransitionDefaultMinimumObjectSize,
} from "@aws-sdk/client-s3";
import {
	getAdminS3Config,
	ADMIN_REQUEST_BLOCK_CONFIG_KEY as REQUEST_BLOCK_CONFIG_KEY,
} from "@server/external/aws/s3/adminS3Config.js";
import {
	CUSTOMER_EXPORTS_PREFIX,
	getCustomerExportsS3Config,
} from "@server/external/aws/s3/customerExportsS3Config.js";

const DEFAULT_REQUEST_BLOCK_CONFIG = {
	orgs: {},
};
const INCOMPLETE_EXPORT_UPLOAD_RULE_ID = "abort-incomplete-customer-exports";
const INCOMPLETE_EXPORT_UPLOAD_DAYS = 7;

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

const ensureIncompleteExportUploadCleanup = async ({
	s3Client,
	bucket,
}: {
	s3Client: S3Client;
	bucket: string;
}) => {
	let rules: LifecycleRule[] = [];
	let transitionDefaultMinimumObjectSize:
		| TransitionDefaultMinimumObjectSize
		| undefined;
	try {
		const lifecycle = await s3Client.send(
			new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
		);
		rules = lifecycle.Rules ?? [];
		transitionDefaultMinimumObjectSize =
			lifecycle.TransitionDefaultMinimumObjectSize;
	} catch (error) {
		if (
			!(error instanceof Error && error.name === "NoSuchLifecycleConfiguration")
		) {
			throw error;
		}
	}

	const prefix = `${CUSTOMER_EXPORTS_PREFIX}/`;
	const existingRule = rules.find(
		(rule) => rule.ID === INCOMPLETE_EXPORT_UPLOAD_RULE_ID,
	);
	if (
		existingRule?.Status === "Enabled" &&
		existingRule.Filter?.Prefix === prefix &&
		existingRule.AbortIncompleteMultipartUpload?.DaysAfterInitiation ===
			INCOMPLETE_EXPORT_UPLOAD_DAYS
	) {
		console.log(`Multipart upload cleanup already configured: ${bucket}`);
		return;
	}

	const cleanupRule: LifecycleRule = {
		ID: INCOMPLETE_EXPORT_UPLOAD_RULE_ID,
		Status: "Enabled",
		Filter: { Prefix: prefix },
		AbortIncompleteMultipartUpload: {
			DaysAfterInitiation: INCOMPLETE_EXPORT_UPLOAD_DAYS,
		},
	};
	await s3Client.send(
		new PutBucketLifecycleConfigurationCommand({
			Bucket: bucket,
			LifecycleConfiguration: {
				Rules: [
					...rules.filter(
						(rule) => rule.ID !== INCOMPLETE_EXPORT_UPLOAD_RULE_ID,
					),
					cleanupRule,
				],
			},
			TransitionDefaultMinimumObjectSize: transitionDefaultMinimumObjectSize,
		}),
	);

	console.log(`Configured multipart upload cleanup: ${bucket}/${prefix}`);
};

const main = async () => {
	const { bucket, region } = getAdminS3Config();
	const s3Client = createS3Client({ region });

	console.log(
		`Initializing S3 admin config for ${process.env.NODE_ENV || "default"} -> s3://${bucket}/${REQUEST_BLOCK_CONFIG_KEY}`,
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

	const customerExports = getCustomerExportsS3Config();
	const customerExportsClient =
		customerExports.region === region
			? s3Client
			: createS3Client({ region: customerExports.region });
	if (customerExports.bucket !== bucket) {
		await ensureBucketExists({
			s3Client: customerExportsClient,
			bucket: customerExports.bucket,
			region: customerExports.region,
		});
	}
	await ensureIncompleteExportUploadCleanup({
		s3Client: customerExportsClient,
		bucket: customerExports.bucket,
	});

	console.log("S3 admin initialization complete.");
};

await main();
