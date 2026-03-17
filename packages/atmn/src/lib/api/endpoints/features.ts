import { request } from "../client.js";
import type { ApiFeature } from "../types/index.js";

/**
 * Fetch features from API
 */
export interface FetchFeaturesOptions {
	secretKey: string;
	includeArchived?: boolean;
}

export interface FetchFeaturesResponse {
	list: ApiFeature[];
}

export async function fetchFeatures(
	options: FetchFeaturesOptions,
): Promise<ApiFeature[]> {
	const { secretKey, includeArchived = true } = options;

	const response = await request<FetchFeaturesResponse>({
		method: "GET",
		path: "/v1/features",
		secretKey,
		queryParams: {
			include_archived: includeArchived,
		},
	});

	return response.list;
}

/**
 * Create or update a feature
 */
export async function upsertFeature(options: {
	secretKey: string;
	feature: Record<string, unknown>;
}): Promise<ApiFeature> {
	const { secretKey, feature } = options;

	return await request<ApiFeature>({
		method: "POST",
		path: "/v1/features",
		secretKey,
		body: feature,
	});
}

/**
 * Update an existing feature
 */
export async function updateFeature(options: {
	secretKey: string;
	featureId: string;
	feature: Record<string, unknown>;
}): Promise<ApiFeature> {
	const { secretKey, featureId, feature } = options;

	return await request<ApiFeature>({
		method: "POST",
		path: `/v1/features/${featureId}`,
		secretKey,
		body: feature,
	});
}

/**
 * Delete a single feature
 */
export async function deleteFeature(options: {
	secretKey: string;
	featureId: string;
}): Promise<void> {
	const { secretKey, featureId } = options;

	await request<void>({
		method: "DELETE",
		path: `/v1/features/${featureId}`,
		secretKey,
	});
}

/**
 * Archive a feature
 */
export async function archiveFeature(options: {
	secretKey: string;
	featureId: string;
}): Promise<void> {
	const { secretKey, featureId } = options;

	await request<void>({
		method: "POST",
		path: `/v1/features/${featureId}`,
		secretKey,
		body: { archived: true },
	});
}

/**
 * Unarchive a feature
 */
export async function unarchiveFeature(options: {
	secretKey: string;
	featureId: string;
}): Promise<void> {
	const { secretKey, featureId } = options;

	await request<void>({
		method: "POST",
		path: `/v1/features/${featureId}`,
		secretKey,
		body: { archived: false },
	});
}

/**
 * Get deletion info for a feature (check if it can be deleted)
 */
export interface FeatureDeletionInfo {
	totalCount: number;
	productName?: string;
}

export async function getFeatureDeletionInfo(options: {
	secretKey: string;
	featureId: string;
}): Promise<FeatureDeletionInfo> {
	const { secretKey, featureId } = options;

	return await request<FeatureDeletionInfo>({
		method: "GET",
		path: `/v1/features/${featureId}/deletion_info`,
		secretKey,
	});
}
