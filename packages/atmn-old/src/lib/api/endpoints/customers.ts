import { request } from "../client.js";

/**
 * Customer API endpoints
 */

/**
 * Customer response with X-API-Version: 2.0.0 (flat structure)
 * Matches BaseApiCustomerSchema from server
 */
export interface ApiCustomer {
	autumn_id?: string;
	id: string;
	name: string | null;
	email: string | null;
	created_at: number;
	fingerprint: string | null;
	stripe_id: string | null;
	env: string;
	metadata: Record<string, unknown>;
	subscriptions: unknown[];
	scheduled_subscriptions: unknown[];
	balances: Record<string, unknown>;
}

export interface FetchCustomersOptions {
	secretKey: string;
	limit?: number;
	offset?: number;
}

export interface FetchCustomersResponse {
	list: ApiCustomer[];
	total: number;
	limit: number;
	offset: number;
	has_more: boolean;
}

/**
 * Fetch a single page of customers
 */
export async function fetchCustomers(
	options: FetchCustomersOptions,
): Promise<ApiCustomer[]> {
	const { secretKey, limit = 100, offset = 0 } = options;

	const response = await request<FetchCustomersResponse>({
		method: "GET",
		path: "/v1/customers",
		secretKey,
		queryParams: {
			limit,
			offset,
		},
	});

	return response.list;
}

/**
 * Fetch all customers across all pages
 */
export async function fetchAllCustomers({
	secretKey,
}: {
	secretKey: string;
}): Promise<ApiCustomer[]> {
	const all: ApiCustomer[] = [];
	const limit = 100;
	let offset = 0;

	while (true) {
		const response = await request<FetchCustomersResponse>({
			method: "GET",
			path: "/v1/customers",
			secretKey,
			queryParams: { limit, offset },
		});

		all.push(...response.list);

		if (response.list.length < limit) break;

		offset += limit;
	}

	return all;
}

/**
 * Delete a single customer
 */
export async function deleteCustomer(options: {
	secretKey: string;
	customerId: string;
}): Promise<void> {
	const { secretKey, customerId } = options;

	await request<void>({
		method: "DELETE",
		path: `/v1/customers/${customerId}`,
		secretKey,
	});
}
