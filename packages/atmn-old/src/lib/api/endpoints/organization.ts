import { request } from "../client.js";
import type { ApiOrganization } from "../types/index.js";

export interface FetchOrganizationOptions {
	secretKey: string;
}

export async function fetchOrganization(
	options: FetchOrganizationOptions,
): Promise<ApiOrganization> {
	const { secretKey } = options;

	return request<ApiOrganization>({
		method: "GET",
		path: "/v1/organization",
		secretKey,
	});
}

export interface OrganizationMeInfo {
	name: string;
	slug: string;
	env: string;
}

export async function fetchOrganizationMe(
	options: FetchOrganizationOptions,
): Promise<OrganizationMeInfo> {
	const { secretKey } = options;

	return request<OrganizationMeInfo>({
		method: "GET",
		path: "/v1/organization/me",
		secretKey,
	});
}
