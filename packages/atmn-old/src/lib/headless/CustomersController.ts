/**
 * Headless controller for the customers command.
 * Provides a programmatic API for AI agents to interact with customers.
 */

import type { ApiCustomer } from "../api/endpoints/customers.js";
import { request } from "../api/client.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";
import type { ApiCustomerExpanded } from "../../views/react/customers/types.js";
import type {
	ListController,
	ListControllerOptions,
	ListControllerState,
	PaginationState,
} from "./types.js";

/**
 * Response from POST /v1/customers/list
 */
interface ListCustomersResponse {
	list: ApiCustomer[];
	has_more: boolean;
	offset: number;
	limit: number;
	total: number;
}

/**
 * All expand params for full customer data
 */
const EXPAND_PARAMS = [
	"invoices",
	"rewards",
	"entities",
	"referrals",
	"subscriptions.plan",
	"scheduled_subscriptions.plan",
	"balances.feature",
].join(",");

/**
 * Headless controller for customers.
 * Can be used by AI agents to programmatically browse and inspect customers.
 */
export class CustomersController
	implements ListController<ApiCustomer, ApiCustomerExpanded>
{
	private items: ApiCustomer[] = [];
	private selectedIndex = 0;
	private page = 1;
	private pageSize: number;
	private hasMore = false;
	private searchQuery = "";
	private environment: AppEnv;
	private secretKey: string;

	constructor(
		environment: AppEnv = AppEnv.Sandbox,
		options: ListControllerOptions = {},
	) {
		this.environment = environment;
		this.pageSize = options.pageSize ?? 50;
		this.searchQuery = options.initialSearch ?? "";
		this.page = options.initialPage ?? 1;
		this.secretKey = getKey(environment);
	}

	// ─────────────────────────────────────────────────────────────────
	// Data Fetching (internal)
	// ─────────────────────────────────────────────────────────────────

	private async fetchCustomers(): Promise<void> {
		const offset = (this.page - 1) * this.pageSize;

		const body: Record<string, unknown> = {
			limit: this.pageSize,
			offset,
		};

		if (this.searchQuery.trim()) {
			body['search'] = this.searchQuery.trim();
		}

		const response = await request<ListCustomersResponse>({
			method: "POST",
			path: "/v1/customers/list",
			secretKey: this.secretKey,
			body,
		});

		this.items = response.list;
		this.hasMore = response.has_more;

		// Reset selection if out of bounds
		if (this.selectedIndex >= this.items.length) {
			this.selectedIndex = Math.max(0, this.items.length - 1);
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// State Queries
	// ─────────────────────────────────────────────────────────────────

	getItems(): ApiCustomer[] {
		return this.items;
	}

	getSelectedItem(): ApiCustomer | null {
		return this.items[this.selectedIndex] ?? null;
	}

	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	getPagination(): PaginationState {
		return {
			page: this.page,
			pageSize: this.pageSize,
			hasMore: this.hasMore,
			totalLoaded: this.items.length,
		};
	}

	hasNextPage(): boolean {
		return this.hasMore;
	}

	hasPrevPage(): boolean {
		return this.page > 1;
	}

	getSearchQuery(): string {
		return this.searchQuery;
	}

	// ─────────────────────────────────────────────────────────────────
	// Navigation Actions
	// ─────────────────────────────────────────────────────────────────

	selectByIndex(index: number): ApiCustomer | null {
		if (index >= 0 && index < this.items.length) {
			this.selectedIndex = index;
			return this.items[index] ?? null;
		}
		return null;
	}

	selectById(id: string): ApiCustomer | null {
		const index = this.items.findIndex((c) => c.id === id);
		if (index !== -1) {
			this.selectedIndex = index;
			return this.items[index] ?? null;
		}
		return null;
	}

	selectPrev(): ApiCustomer | null {
		if (this.selectedIndex > 0) {
			this.selectedIndex--;
			return this.items[this.selectedIndex] ?? null;
		}
		return null;
	}

	selectNext(): ApiCustomer | null {
		if (this.selectedIndex < this.items.length - 1) {
			this.selectedIndex++;
			return this.items[this.selectedIndex] ?? null;
		}
		return null;
	}

	// ─────────────────────────────────────────────────────────────────
	// Data Actions
	// ─────────────────────────────────────────────────────────────────

	async nextPage(): Promise<void> {
		if (this.hasMore) {
			this.page++;
			this.selectedIndex = 0;
			await this.fetchCustomers();
		}
	}

	async prevPage(): Promise<void> {
		if (this.page > 1) {
			this.page--;
			this.selectedIndex = 0;
			await this.fetchCustomers();
		}
	}

	async goToPage(page: number): Promise<void> {
		if (page >= 1) {
			this.page = page;
			this.selectedIndex = 0;
			await this.fetchCustomers();
		}
	}

	async search(query: string): Promise<void> {
		this.searchQuery = query;
		this.page = 1;
		this.selectedIndex = 0;
		await this.fetchCustomers();
	}

	async clearSearch(): Promise<void> {
		this.searchQuery = "";
		this.page = 1;
		this.selectedIndex = 0;
		await this.fetchCustomers();
	}

	async refresh(): Promise<void> {
		await this.fetchCustomers();
	}

	// ─────────────────────────────────────────────────────────────────
	// Detail Data
	// ─────────────────────────────────────────────────────────────────

	async getExpandedItem(id: string): Promise<ApiCustomerExpanded | null> {
		try {
			const response = await request<ApiCustomerExpanded>({
				method: "GET",
				path: `/v1/customers/${encodeURIComponent(id)}`,
				secretKey: this.secretKey,
				queryParams: {
					expand: EXPAND_PARAMS,
				},
			});
			return response;
		} catch {
			return null;
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Output Formats
	// ─────────────────────────────────────────────────────────────────

	toJSON(): ListControllerState<ApiCustomer> {
		return {
			items: this.items,
			selectedIndex: this.selectedIndex,
			selectedItem: this.getSelectedItem(),
			pagination: this.getPagination(),
			searchQuery: this.searchQuery,
			availableActions: this.getAvailableActions(),
		};
	}

	describe(): string {
		const selected = this.getSelectedItem();
		const lines: string[] = [];

		lines.push(`=== Customers (${this.environment}) ===`);
		lines.push(
			`Page ${this.page} | ${this.items.length} items loaded | ${this.hasMore ? "more available" : "last page"}`,
		);

		if (this.searchQuery) {
			lines.push(`Search: "${this.searchQuery}"`);
		}

		lines.push("");

		if (this.items.length === 0) {
			lines.push("No customers found.");
		} else {
			lines.push("Customers:");
			for (let i = 0; i < this.items.length; i++) {
				const c = this.items[i]!;
				const marker = i === this.selectedIndex ? "▸" : " ";
				const name = c.name ?? "(no name)";
				const email = c.email ?? "(no email)";
				lines.push(`${marker} [${i}] ${c.id} | ${name} | ${email}`);
			}
		}

		if (selected) {
			lines.push("");
			lines.push(`Selected: ${selected.id}`);
			lines.push(`  Name: ${selected.name ?? "-"}`);
			lines.push(`  Email: ${selected.email ?? "-"}`);
			lines.push(`  Created: ${new Date(selected.created_at * 1000).toISOString()}`);
			if (selected.stripe_id) {
				lines.push(`  Stripe ID: ${selected.stripe_id}`);
			}
		}

		lines.push("");
		lines.push(`Available actions: ${this.getAvailableActions().join(", ")}`);

		return lines.join("\n");
	}

	getAvailableActions(): string[] {
		const actions: string[] = ["refresh", "selectByIndex", "selectById"];

		if (this.items.length > 0) {
			if (this.selectedIndex > 0) actions.push("selectPrev");
			if (this.selectedIndex < this.items.length - 1) actions.push("selectNext");
			actions.push("getExpandedItem");
		}

		if (this.hasMore) actions.push("nextPage");
		if (this.page > 1) actions.push("prevPage");

		actions.push("search", "goToPage");
		if (this.searchQuery) actions.push("clearSearch");

		return actions;
	}
}

/**
 * Create a new CustomersController and initialize it with data
 */
export async function createCustomersController(
	environment: AppEnv = AppEnv.Sandbox,
	options: ListControllerOptions = {},
): Promise<CustomersController> {
	const controller = new CustomersController(environment, options);
	await controller.refresh();
	return controller;
}
