import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { DEFAULT_AWS_REGION } from "@/external/aws/awsRegionUtils.js";
import {
	RequestBlockConfigSchema,
	type RequestBlockConfig,
	type RequestBlockEntry,
	type RequestBlockUpdate,
} from "./requestBlockSchemas.js";

const POLL_INTERVAL_MS = 60_000;

type RequestBlockStatus = {
	configured: boolean;
	healthy: boolean;
	lastFetchAt?: string;
	lastSuccessAt?: string;
	error?: string;
};

const emptyConfig = (): RequestBlockConfig => ({ orgs: {} });

let runtimeConfig: RequestBlockConfig = emptyConfig();
let runtimeStatus: RequestBlockStatus = {
	configured: false,
	healthy: false,
	error: "Request block config is not configured",
};
let pollTimer: ReturnType<typeof setInterval> | null = null;

const getConfigLocation = () => {
	const bucket = process.env.REQUEST_BLOCK_CONFIG_S3_BUCKET;
	const key = process.env.REQUEST_BLOCK_CONFIG_S3_KEY;
	const region =
		process.env.REQUEST_BLOCK_CONFIG_S3_REGION ||
		process.env.AWS_REGION ||
		DEFAULT_AWS_REGION;

	return {
		bucket,
		key,
		region,
		configured: Boolean(bucket && key),
	};
};

const getS3Client = () => {
	const { region } = getConfigLocation();
	return new S3Client({ region });
};

const streamToString = async (body: { transformToString?: () => Promise<string> }) => {
	if (typeof body.transformToString === "function") {
		return await body.transformToString();
	}

	return await new Response(body as BodyInit).text();
};

const readConfigFromS3 = async (): Promise<RequestBlockConfig> => {
	const { bucket, key, configured } = getConfigLocation();

	if (!configured || !bucket || !key) {
		return emptyConfig();
	}

	const client = getS3Client();
	try {
		const response = await client.send(
			new GetObjectCommand({
				Bucket: bucket,
				Key: key,
			}),
		);

		if (!response.Body) {
			return emptyConfig();
		}

		const raw = (await streamToString(response.Body)).trim();
		if (!raw) {
			return emptyConfig();
		}

		return RequestBlockConfigSchema.parse(JSON.parse(raw));
	} catch (error) {
		const name = error instanceof Error ? error.name : "";
		if (name === "NoSuchKey") {
			return emptyConfig();
		}
		throw error;
	}
};

const writeConfigToS3 = async (config: RequestBlockConfig) => {
	const { bucket, key, configured } = getConfigLocation();

	if (!configured || !bucket || !key) {
		throw new RecaseError({
			message: "Request block config is not configured",
			code: ErrCode.InvalidRequest,
			statusCode: 503,
		});
	}

	const client = getS3Client();
	await client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: JSON.stringify(config, null, 2),
			ContentType: "application/json",
		}),
	);
};

const nowIso = () => new Date().toISOString();

export const getRuntimeRequestBlockStatus = () => runtimeStatus;

export const getRuntimeRequestBlockEntry = (
	orgId: string,
): RequestBlockEntry | undefined => runtimeConfig.orgs[orgId];

export const getRuntimeRequestBlockConfig = () => runtimeConfig;

export const refreshRequestBlockConfig = async ({
	logger,
}: {
	logger?: Logger;
} = {}) => {
	const { configured } = getConfigLocation();
	runtimeStatus = {
		...runtimeStatus,
		configured,
		lastFetchAt: nowIso(),
	};

	if (!configured) {
		runtimeConfig = emptyConfig();
		runtimeStatus = {
			configured: false,
			healthy: false,
			lastFetchAt: runtimeStatus.lastFetchAt,
			lastSuccessAt: runtimeStatus.lastSuccessAt,
			error: "Request block config is not configured",
		};
		return;
	}

	try {
		const config = await readConfigFromS3();
		runtimeConfig = config;
		runtimeStatus = {
			configured: true,
			healthy: true,
			lastFetchAt: runtimeStatus.lastFetchAt,
			lastSuccessAt: nowIso(),
		};
	} catch (error) {
		runtimeConfig = emptyConfig();
		runtimeStatus = {
			configured: true,
			healthy: false,
			lastFetchAt: runtimeStatus.lastFetchAt,
			lastSuccessAt: runtimeStatus.lastSuccessAt,
			error: error instanceof Error ? error.message : "Failed to load config",
		};
		logger?.error("Failed to refresh request block config", { error });
	}
};

export const startRequestBlockPolling = async ({
	logger,
}: {
	logger?: Logger;
} = {}) => {
	if (pollTimer) {
		return;
	}

	await refreshRequestBlockConfig({ logger });
	pollTimer = setInterval(() => {
		void refreshRequestBlockConfig({ logger });
	}, POLL_INTERVAL_MS);
};

export const stopRequestBlockPolling = () => {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
};

export const getRequestBlockConfigFromSource = async () => {
	return await readConfigFromS3();
};

export const getOrgRequestBlockFromSource = async (orgId: string) => {
	const config = await readConfigFromS3();
	return config.orgs[orgId];
};

export const updateOrgRequestBlockInSource = async ({
	orgId,
	update,
	updatedBy,
}: {
	orgId: string;
	update: RequestBlockUpdate;
	updatedBy?: string;
}) => {
	const config = await readConfigFromS3();
	const shouldDelete =
		!update.blockAll && update.blockedEndpoints.length === 0;

	if (shouldDelete) {
		delete config.orgs[orgId];
	} else {
		config.orgs[orgId] = {
			blockAll: update.blockAll,
			blockedEndpoints: update.blockedEndpoints,
			updatedAt: nowIso(),
			...(updatedBy && { updatedBy }),
		};
	}

	await writeConfigToS3(config);

	runtimeConfig = config;
	runtimeStatus = {
		configured: true,
		healthy: true,
		lastFetchAt: nowIso(),
		lastSuccessAt: nowIso(),
	};

	return config.orgs[orgId];
};
