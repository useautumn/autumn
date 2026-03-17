import type { ApiPlanParams } from "../../transforms/sdkToApi/index.js";
import { request } from "../client.js";
import type { ApiPlan } from "../types/index.js";

/**
 * Fetch plans from API
 */
export interface FetchPlansOptions {
	secretKey: string;
	includeArchived?: boolean;
}

export interface FetchPlansResponse {
	list: ApiPlan[];
}

export async function fetchPlans(
	options: FetchPlansOptions,
): Promise<ApiPlan[]> {
	const { secretKey, includeArchived = true } = options;

	const response = await request<FetchPlansResponse>({
		method: "GET",
		path: "/v1/products",
		secretKey,
		queryParams: {
			include_archived: includeArchived,
		},
	});

	return response.list;
}

/**
 * Create a new plan
 */
export async function createPlan(options: {
	secretKey: string;
	plan: Record<string, unknown>;
}): Promise<ApiPlan> {
	const { secretKey, plan } = options;

	return await request<ApiPlan>({
		method: "POST",
		path: "/v1/products",
		secretKey,
		body: plan,
	});
}

/**
 * Update an existing plan
 */
export async function updatePlan(options: {
	secretKey: string;
	planId: string;
	plan: Record<string, unknown>;
}): Promise<ApiPlan> {
	const { secretKey, planId, plan } = options;

	return await request<ApiPlan>({
		method: "POST",
		path: `/v1/products/${planId}`,
		secretKey,
		body: plan,
	});
}

/**
 * Delete a single plan
 */
export async function deletePlan(options: {
	secretKey: string;
	planId: string;
	allVersions?: boolean;
}): Promise<void> {
	const { secretKey, planId, allVersions = true } = options;

	await request<void>({
		method: "DELETE",
		path: `/v1/products/${planId}`,
		secretKey,
		queryParams: {
			all_versions: allVersions,
		},
	});
}

/**
 * Archive a plan
 */
export async function archivePlan(options: {
	secretKey: string;
	planId: string;
}): Promise<void> {
	const { secretKey, planId } = options;

	await request<void>({
		method: "POST",
		path: `/v1/products/${planId}`,
		secretKey,
		body: { archived: true },
	});
}

/**
 * Unarchive a plan
 */
export async function unarchivePlan(options: {
	secretKey: string;
	planId: string;
}): Promise<void> {
	const { secretKey, planId } = options;

	await request<void>({
		method: "POST",
		path: `/v1/products/${planId}`,
		secretKey,
		body: { archived: false },
	});
}

/**
 * Get deletion info for a plan (check if it can be deleted)
 */
export interface PlanDeletionInfo {
	totalCount: number;
	customerName?: string;
}

export async function getPlanDeletionInfo(options: {
	secretKey: string;
	planId: string;
}): Promise<PlanDeletionInfo> {
	const { secretKey, planId } = options;

	return await request<PlanDeletionInfo>({
		method: "GET",
		path: `/v1/products/${planId}/deletion_info`,
		secretKey,
	});
}

/**
 * Migrate customers between product versions
 */
export async function migrateProduct(options: {
	secretKey: string;
	fromProductId: string;
	fromVersion: number;
	toProductId: string;
	toVersion: number;
}): Promise<void> {
	const { secretKey, fromProductId, fromVersion, toProductId, toVersion } =
		options;

	await request<void>({
		method: "POST",
		path: "/v1/migrations",
		secretKey,
		body: {
			from_product_id: fromProductId,
			from_version: fromVersion,
			to_product_id: toProductId,
			to_version: toVersion,
		},
	});
}

/**
 * Check if a plan has customers (for versioning check)
 * Sends the plan data to compare against the current version
 */
export interface PlanHasCustomersInfo {
	will_version: boolean;
	archived: boolean;
}

export async function getPlanHasCustomers(options: {
	secretKey: string;
	planId: string;
	plan: ApiPlanParams;
}): Promise<PlanHasCustomersInfo> {
	const { secretKey, planId, plan } = options;

	return await request<PlanHasCustomersInfo>({
		method: "POST",
		path: `/v1/products/${planId}/has_customers`,
		secretKey,
		body: plan,
	});
}
