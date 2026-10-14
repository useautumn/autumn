import type { ApiPlanParams } from "../../transforms/sdkToApi/index.js";
import { request } from "../client.js";
import type { ApiPlan } from "../types/index.js";

export interface FetchPlansOptions {
	secretKey: string;
	includeArchived?: boolean;
	allVersions?: boolean;
}

export interface FetchPlansResponse {
	list: ApiPlan[];
}

export async function fetchPlans(
	options: FetchPlansOptions,
): Promise<ApiPlan[]> {
	const { secretKey, includeArchived = true, allVersions = false } = options;

	const response = await request<FetchPlansResponse>({
		method: "POST",
		path: "/v1/plans.list",
		secretKey,
		body: {
			include_archived: includeArchived,
			all_versions: allVersions,
		},
	});

	return response.list;
}

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
