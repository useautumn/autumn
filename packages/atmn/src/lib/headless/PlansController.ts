/**
 * Headless controller for the plans command.
 * Provides a programmatic API for AI agents to interact with plans/products.
 *
 * Key difference from CustomersController: Plans use LOCAL pagination since
 * the backend returns all plans in a single call.
 */

import type { ApiPlan } from "../api/types/index.js";
import { fetchPlans } from "../api/endpoints/plans.js";
import type {
	ListController,
	ListControllerState,
	PaginationState,
} from "./types.js";

/**
 * Options for creating a PlansController
 */
export interface PlansControllerOptions {
	/** API secret key for authentication */
	secretKey: string;
	/** Page size for local pagination (default: 50) */
	pageSize?: number;
	/** Include archived plans (default: false) */
	includeArchived?: boolean;
	/** Initial search query */
	initialSearch?: string;
	/** Initial page */
	initialPage?: number;
}

/**
 * Headless controller for plans.
 * Can be used by AI agents to programmatically browse and inspect plans.
 *
 * Uses LOCAL pagination: all plans are fetched once from the API,
 * then filtered and paginated in memory.
 */
export class PlansController implements ListController<ApiPlan, ApiPlan> {
	private allPlans: ApiPlan[] = [];
	private filteredPlans: ApiPlan[] = [];
	private selectedIndex = 0;
	private page = 1;
	private pageSize: number;
	private searchQuery = "";
	private secretKey: string;
	private includeArchived: boolean;

	constructor(options: PlansControllerOptions) {
		this.secretKey = options.secretKey;
		this.pageSize = options.pageSize ?? 50;
		this.includeArchived = options.includeArchived ?? false;
		this.searchQuery = options.initialSearch ?? "";
		this.page = options.initialPage ?? 1;
	}

	// ─────────────────────────────────────────────────────────────────
	// Data Fetching (internal)
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Fetch all plans from the API once
	 */
	private async fetchAllPlans(): Promise<void> {
		this.allPlans = await fetchPlans({
			secretKey: this.secretKey,
			includeArchived: this.includeArchived,
		});

		this.applyFilter();
	}

	/**
	 * Apply search filter to allPlans, storing result in filteredPlans
	 */
	private applyFilter(): void {
		const query = this.searchQuery.trim().toLowerCase();

		if (!query) {
			this.filteredPlans = [...this.allPlans];
		} else {
			this.filteredPlans = this.allPlans.filter((plan) => {
				const idMatch = plan.id.toLowerCase().includes(query);
				const nameMatch = plan.name.toLowerCase().includes(query);
				const descMatch = plan.description?.toLowerCase().includes(query);
				return idMatch || nameMatch || descMatch;
			});
		}

		// Reset selection if out of bounds
		const pageItems = this.getCurrentPageItems();
		if (this.selectedIndex >= pageItems.length) {
			this.selectedIndex = Math.max(0, pageItems.length - 1);
		}
	}

	/**
	 * Get items for the current page (local pagination)
	 */
	private getCurrentPageItems(): ApiPlan[] {
		const start = (this.page - 1) * this.pageSize;
		const end = start + this.pageSize;
		return this.filteredPlans.slice(start, end);
	}

	// ─────────────────────────────────────────────────────────────────
	// State Queries
	// ─────────────────────────────────────────────────────────────────

	getItems(): ApiPlan[] {
		return this.getCurrentPageItems();
	}

	getSelectedItem(): ApiPlan | null {
		const items = this.getCurrentPageItems();
		return items[this.selectedIndex] ?? null;
	}

	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	getPagination(): PaginationState {
		const items = this.getCurrentPageItems();
		const totalPages = Math.ceil(this.filteredPlans.length / this.pageSize);
		return {
			page: this.page,
			pageSize: this.pageSize,
			hasMore: this.page < totalPages,
			totalLoaded: items.length,
		};
	}

	hasNextPage(): boolean {
		return this.page * this.pageSize < this.filteredPlans.length;
	}

	hasPrevPage(): boolean {
		return this.page > 1;
	}

	getSearchQuery(): string {
		return this.searchQuery;
	}

	/**
	 * Get the total number of plans (after filtering)
	 */
	getTotalCount(): number {
		return this.filteredPlans.length;
	}

	/**
	 * Get the total number of pages
	 */
	getTotalPages(): number {
		return Math.ceil(this.filteredPlans.length / this.pageSize);
	}

	// ─────────────────────────────────────────────────────────────────
	// Navigation Actions
	// ─────────────────────────────────────────────────────────────────

	selectByIndex(index: number): ApiPlan | null {
		const items = this.getCurrentPageItems();
		if (index >= 0 && index < items.length) {
			this.selectedIndex = index;
			return items[index] ?? null;
		}
		return null;
	}

	selectById(id: string): ApiPlan | null {
		const items = this.getCurrentPageItems();
		const index = items.findIndex((p) => p.id === id);
		if (index !== -1) {
			this.selectedIndex = index;
			return items[index] ?? null;
		}
		return null;
	}

	selectPrev(): ApiPlan | null {
		if (this.selectedIndex > 0) {
			this.selectedIndex--;
			return this.getCurrentPageItems()[this.selectedIndex] ?? null;
		}
		return null;
	}

	selectNext(): ApiPlan | null {
		const items = this.getCurrentPageItems();
		if (this.selectedIndex < items.length - 1) {
			this.selectedIndex++;
			return items[this.selectedIndex] ?? null;
		}
		return null;
	}

	// ─────────────────────────────────────────────────────────────────
	// Data Actions (Local Pagination)
	// ─────────────────────────────────────────────────────────────────

	async nextPage(): Promise<void> {
		if (this.hasNextPage()) {
			this.page++;
			this.selectedIndex = 0;
		}
	}

	async prevPage(): Promise<void> {
		if (this.page > 1) {
			this.page--;
			this.selectedIndex = 0;
		}
	}

	async goToPage(page: number): Promise<void> {
		const totalPages = this.getTotalPages();
		if (page >= 1 && page <= totalPages) {
			this.page = page;
			this.selectedIndex = 0;
		}
	}

	async search(query: string): Promise<void> {
		this.searchQuery = query;
		this.page = 1;
		this.selectedIndex = 0;
		this.applyFilter();
	}

	async clearSearch(): Promise<void> {
		this.searchQuery = "";
		this.page = 1;
		this.selectedIndex = 0;
		this.applyFilter();
	}

	async refresh(): Promise<void> {
		await this.fetchAllPlans();
	}

	// ─────────────────────────────────────────────────────────────────
	// Detail Data
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Get expanded details for a plan.
	 * For plans, no additional data is needed - returns the plan as-is.
	 */
	async getExpandedItem(id: string): Promise<ApiPlan | null> {
		const plan = this.allPlans.find((p) => p.id === id);
		return plan ?? null;
	}

	// ─────────────────────────────────────────────────────────────────
	// Output Formats
	// ─────────────────────────────────────────────────────────────────

	toJSON(): ListControllerState<ApiPlan> {
		return {
			items: this.getCurrentPageItems(),
			selectedIndex: this.selectedIndex,
			selectedItem: this.getSelectedItem(),
			pagination: this.getPagination(),
			searchQuery: this.searchQuery,
			availableActions: this.getAvailableActions(),
		};
	}

	describe(): string {
		const selected = this.getSelectedItem();
		const items = this.getCurrentPageItems();
		const totalPages = this.getTotalPages();
		const lines: string[] = [];

		lines.push(`=== Plans ===`);
		lines.push(
			`Page ${this.page}/${totalPages || 1} | ${items.length} items | ${this.filteredPlans.length} total`,
		);

		if (this.searchQuery) {
			lines.push(`Search: "${this.searchQuery}"`);
		}

		if (!this.includeArchived) {
			lines.push(`(archived plans hidden)`);
		}

		lines.push("");

		if (items.length === 0) {
			lines.push("No plans found.");
		} else {
			lines.push("Plans:");
			for (let i = 0; i < items.length; i++) {
				const p = items[i]!;
				const marker = i === this.selectedIndex ? "▸" : " ";
				const name = p.name ?? "(no name)";
				const archived = p.archived ? " [archived]" : "";
				const addOn = p.add_on ? " [add-on]" : "";
				const isDefault = p.auto_enable ? " [default]" : "";
				lines.push(
					`${marker} [${i}] ${p.id} | ${name}${archived}${addOn}${isDefault}`,
				);
			}
		}

		if (selected) {
			lines.push("");
			lines.push(`Selected: ${selected.id}`);
			lines.push(`  Name: ${selected.name ?? "-"}`);
			lines.push(`  Description: ${selected.description ?? "-"}`);
			lines.push(`  Version: ${selected.version}`);
			lines.push(`  Group: ${selected.group ?? "-"}`);
			lines.push(`  Add-on: ${selected.add_on ? "yes" : "no"}`);
			lines.push(`  Default: ${selected.auto_enable ? "yes" : "no"}`);
			lines.push(`  Archived: ${selected.archived ? "yes" : "no"}`);
			lines.push(`  Environment: ${selected.env}`);
			if (selected.price) {
				lines.push(
					`  Price: ${selected.price.amount} / ${selected.price.interval}`,
				);
			}
			lines.push(`  Items: ${selected.items?.length ?? 0}`);
			lines.push(
				`  Created: ${new Date(selected.created_at * 1000).toISOString()}`,
			);
		}

		lines.push("");
		lines.push(`Available actions: ${this.getAvailableActions().join(", ")}`);

		return lines.join("\n");
	}

	getAvailableActions(): string[] {
		const actions: string[] = ["refresh", "selectByIndex", "selectById"];
		const items = this.getCurrentPageItems();

		if (items.length > 0) {
			if (this.selectedIndex > 0) actions.push("selectPrev");
			if (this.selectedIndex < items.length - 1) actions.push("selectNext");
			actions.push("getExpandedItem");
		}

		if (this.hasNextPage()) actions.push("nextPage");
		if (this.page > 1) actions.push("prevPage");

		actions.push("search", "goToPage");
		if (this.searchQuery) actions.push("clearSearch");

		return actions;
	}
}

/**
 * Create a new PlansController and initialize it with data
 */
export async function createPlansController(
	options: PlansControllerOptions,
): Promise<PlansController> {
	const controller = new PlansController(options);
	await controller.refresh();
	return controller;
}
