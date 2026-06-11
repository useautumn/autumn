#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
	BucketAlreadyExists,
	BucketAlreadyOwnedByYou,
	type BucketLocationConstraint,
	CreateBucketCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadBucketCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_BUCKET = "leaf-dev-contracts";
const DEFAULT_LOCAL_DIR = "apps/leaf/contracts";
const DEFAULT_PREFIX = "contracts";
const DEFAULT_REGION = "eu-west-2";

type ContractsCommand = "pull" | "push";

type ContractsArgs = {
	bucket: string;
	command: ContractsCommand;
	localDir: string;
	prefix: string;
	region: string;
};

type LocalFile = {
	bytes: Buffer;
	path: string;
	relativePath: string;
	sha256: string;
};

type RemoteObject = {
	key: string;
	relativePath: string;
	size: number;
};

const usage = () => {
	console.log(`Usage:
  bun scripts/s3/contracts.ts pull [options]
  bun scripts/s3/contracts.ts push [options]

Options:
  --local-dir <path>  Local contracts directory (default: ${DEFAULT_LOCAL_DIR})
  --bucket <bucket>   S3 bucket (default: ${DEFAULT_BUCKET})
  --prefix <prefix>   S3 prefix (default: ${DEFAULT_PREFIX})
  --region <region>   AWS region (default: ${DEFAULT_REGION})

Package commands:
  bun contracts pull
  bun contracts push`);
};

const getHttpStatusCode = ({ error }: { error: unknown }) => {
	if (!error || typeof error !== "object") return undefined;
	return (error as { $metadata?: { httpStatusCode?: number } }).$metadata
		?.httpStatusCode;
};

const isMissingS3ResourceError = ({ error }: { error: unknown }) => {
	if (error instanceof Error) {
		if (error.name === "NotFound" || error.name === "NoSuchBucket") {
			return true;
		}
	}
	return getHttpStatusCode({ error }) === 404;
};

const createS3Client = ({ region }: { region: string }) => {
	return new S3Client({ region });
};

type BucketState = "exists" | "missing" | "unknown";

const getBucketState = async ({
	bucket,
	region,
	s3Client,
}: {
	bucket: string;
	region: string;
	s3Client: S3Client;
}): Promise<BucketState> => {
	try {
		await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
		return "exists";
	} catch (error) {
		if (isMissingS3ResourceError({ error })) return "missing";
		const statusCode = getHttpStatusCode({ error });
		if (statusCode === 301 || statusCode === 403) {
			console.warn(
				`Could not confirm bucket ${bucket} in ${region}; trying CreateBucket before failing.`,
			);
			return "unknown";
		}
		throw error;
	}
};

const ensureBucketExists = async ({
	bucket,
	region,
	s3Client,
}: {
	bucket: string;
	region: string;
	s3Client: S3Client;
}) => {
	const state = await getBucketState({ bucket, region, s3Client });
	if (state === "exists") {
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
		if (error instanceof BucketAlreadyOwnedByYou) {
			console.log(`Bucket already owned by this account: ${bucket}`);
			return;
		}
		if (error instanceof BucketAlreadyExists) {
			throw new Error(
				`Bucket ${bucket} already exists globally but is not owned by this AWS account. Set LEAF_CONTRACTS_BUCKET to an owned bucket name.`,
			);
		}
		if (getHttpStatusCode({ error }) === 403) {
			throw new Error(
				`Current AWS credentials cannot create or access bucket ${bucket}. Check IAM permissions or set LEAF_CONTRACTS_BUCKET.`,
			);
		}
		throw error;
	}
};

const normalizePrefix = ({ prefix }: { prefix: string }) =>
	prefix.replace(/^\/+|\/+$/g, "");

const keyForRelativePath = ({
	prefix,
	relativePath,
}: {
	prefix: string;
	relativePath: string;
}) => [normalizePrefix({ prefix }), relativePath].filter(Boolean).join("/");

const relativePathForKey = ({
	key,
	prefix,
}: {
	key: string;
	prefix: string;
}) => {
	const normalizedPrefix = normalizePrefix({ prefix });
	if (!normalizedPrefix) return key;
	return key.startsWith(`${normalizedPrefix}/`)
		? key.slice(normalizedPrefix.length + 1)
		: key;
};

const contentTypeForPath = ({ path }: { path: string }) => {
	if (path.endsWith(".pdf")) return "application/pdf";
	if (path.endsWith(".html")) return "text/html; charset=utf-8";
	if (path.endsWith(".json")) return "application/json";
	if (path.endsWith(".md")) return "text/markdown; charset=utf-8";
	if (path.endsWith(".txt")) return "text/plain; charset=utf-8";
	return "application/octet-stream";
};

const toPosixPath = ({ path }: { path: string }) => path.split(sep).join("/");

const collectLocalFiles = async ({
	baseDir,
	currentDir = baseDir,
}: {
	baseDir: string;
	currentDir?: string;
}): Promise<LocalFile[]> => {
	const entries = await readdir(currentDir, { withFileTypes: true }).catch(
		(error: unknown) => {
			if ((error as { code?: string }).code === "ENOENT") return [];
			throw error;
		},
	);
	const files: LocalFile[] = [];

	for (const entry of entries) {
		const path = join(currentDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectLocalFiles({ baseDir, currentDir: path })));
			continue;
		}
		if (!entry.isFile()) continue;

		const bytes = Buffer.from(await Bun.file(path).arrayBuffer());
		files.push({
			bytes,
			path,
			relativePath: toPosixPath({ path: relative(baseDir, path) }),
			sha256: createHash("sha256").update(bytes).digest("hex"),
		});
	}

	return files;
};

const listRemoteObjects = async ({
	bucket,
	prefix,
	s3Client,
}: {
	bucket: string;
	prefix: string;
	s3Client: S3Client;
}) => {
	const normalizedPrefix = normalizePrefix({ prefix });
	const objects: RemoteObject[] = [];
	let continuationToken: string | undefined;

	do {
		const response = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				ContinuationToken: continuationToken,
				Prefix: normalizedPrefix ? `${normalizedPrefix}/` : undefined,
			}),
		);
		for (const object of response.Contents ?? []) {
			if (!object.Key || object.Key.endsWith("/")) continue;
			objects.push({
				key: object.Key,
				relativePath: relativePathForKey({ key: object.Key, prefix }),
				size: object.Size ?? 0,
			});
		}
		continuationToken = response.NextContinuationToken;
	} while (continuationToken);

	return objects;
};

const pullContracts = async ({ args }: { args: ContractsArgs }) => {
	const s3Client = createS3Client({ region: args.region });
	await ensureBucketExists({
		bucket: args.bucket,
		region: args.region,
		s3Client,
	});

	const localDir = resolve(args.localDir);
	const objects = await listRemoteObjects({
		bucket: args.bucket,
		prefix: args.prefix,
		s3Client,
	});

	await rm(localDir, { force: true, recursive: true });
	await mkdir(localDir, { recursive: true });

	for (const object of objects) {
		const response = await s3Client.send(
			new GetObjectCommand({ Bucket: args.bucket, Key: object.key }),
		);
		const bytes = await response.Body?.transformToByteArray();
		if (!bytes) continue;
		const targetPath = join(localDir, object.relativePath);
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, Buffer.from(bytes));
		console.log(`Pulled s3://${args.bucket}/${object.key} -> ${targetPath}`);
	}

	console.log("");
	console.log(`Pulled ${objects.length} file(s) into ${localDir}`);
};

const pushContracts = async ({ args }: { args: ContractsArgs }) => {
	const s3Client = createS3Client({ region: args.region });
	await ensureBucketExists({
		bucket: args.bucket,
		region: args.region,
		s3Client,
	});

	const localDir = resolve(args.localDir);
	const [localFiles, remoteObjects] = await Promise.all([
		collectLocalFiles({ baseDir: localDir }),
		listRemoteObjects({ bucket: args.bucket, prefix: args.prefix, s3Client }),
	]);
	const localKeys = new Set(
		localFiles.map((file) =>
			keyForRelativePath({
				prefix: args.prefix,
				relativePath: file.relativePath,
			}),
		),
	);

	for (const file of localFiles) {
		const key = keyForRelativePath({
			prefix: args.prefix,
			relativePath: file.relativePath,
		});
		await s3Client.send(
			new PutObjectCommand({
				Body: file.bytes,
				Bucket: args.bucket,
				ContentType: contentTypeForPath({ path: file.relativePath }),
				Key: key,
				Metadata: { sha256: file.sha256 },
			}),
		);
		console.log(`Pushed ${file.path} -> s3://${args.bucket}/${key}`);
	}

	const staleObjects = remoteObjects.filter(
		(object) => !localKeys.has(object.key),
	);
	for (let index = 0; index < staleObjects.length; index += 1000) {
		const batch = staleObjects.slice(index, index + 1000);
		await s3Client.send(
			new DeleteObjectsCommand({
				Bucket: args.bucket,
				Delete: {
					Objects: batch.map((object) => ({ Key: object.key })),
					Quiet: true,
				},
			}),
		);
		for (const object of batch) {
			console.log(`Deleted s3://${args.bucket}/${object.key}`);
		}
	}

	console.log("");
	console.log(`Pushed ${localFiles.length} file(s) from ${localDir}`);
	console.log(`Deleted ${staleObjects.length} stale remote file(s)`);
};

const parseArgs = ({ argv }: { argv: string[] }): ContractsArgs => {
	const [command, ...options] = argv;
	if (!command || command === "--help" || command === "-h") {
		usage();
		process.exit(0);
	}
	if (command !== "pull" && command !== "push") {
		throw new Error(`Unknown command: ${command}`);
	}

	const args: ContractsArgs = {
		bucket: process.env.LEAF_CONTRACTS_BUCKET ?? DEFAULT_BUCKET,
		command,
		localDir: process.env.LEAF_CONTRACTS_LOCAL_DIR ?? DEFAULT_LOCAL_DIR,
		prefix: process.env.LEAF_CONTRACTS_PREFIX ?? DEFAULT_PREFIX,
		region: process.env.LEAF_CONTRACTS_REGION ?? DEFAULT_REGION,
	};

	for (let index = 0; index < options.length; index += 1) {
		const option = options[index];
		const value = options[index + 1];
		if (!option?.startsWith("--")) continue;
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${option}`);
		}
		index += 1;

		if (option === "--local-dir") args.localDir = value;
		else if (option === "--bucket") args.bucket = value;
		else if (option === "--prefix") args.prefix = value;
		else if (option === "--region") args.region = value;
		else throw new Error(`Unknown option: ${option}`);
	}

	return args;
};

const main = async () => {
	const args = parseArgs({ argv: Bun.argv.slice(2) });
	if (args.command === "pull") {
		await pullContracts({ args });
		return;
	}
	await pushContracts({ args });
};

await main();
