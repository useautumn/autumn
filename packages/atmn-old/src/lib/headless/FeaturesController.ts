import { isGraduatedCreditSchemaItem } from "@autumn/shared";
import type { ApiFeature } from "../api/types/index.js";
import { fetchFeatures } from "../api/endpoints/features.js";
import type {
	ListController,
	ListControllerState,
	PaginationState,
} from "./types.js";

export interface FeaturesControllerOptions {
	secretKey: string;
	pageSize?: number;
	includeArchived?: boolean;
	initialSearch?: string;
	initialPage?: number;
}

export class FeaturesController
	implements ListController<ApiFeature, ApiFeature>
{
	private allFeatures: ApiFeature[] = [];
	private filteredFeatures: ApiFeature[] = [];
	private selectedIndex = 0;
	private page = 1;
	private pageSize: number;
	private searchQuery = "";
	private secretKey: string;
	private includeArchived: boolean;

	constructor(options: FeaturesControllerOptions) {
		this.secretKey = options.secretKey;
		this.pageSize = options.pageSize ?? 50;
		this.includeArchived = options.includeArchived ?? false;
		this.searchQuery = options.initialSearch ?? "";
		this.page = options.initialPage ?? 1;
	}

	private async fetchAllFeatures(): Promise<void> {
		this.allFeatures = await fetchFeatures({
			secretKey: this.secretKey,
			includeArchived: this.includeArchived,
		});

		this.applyFilter();
	}

	private applyFilter(): void {
		const query = this.searchQuery.trim().toLowerCase();

		if (!query) {
			this.filteredFeatures = [...this.allFeatures];
		} else {
			this.filteredFeatures = this.allFeatures.filter((feature) => {
				const idMatch = feature.id.toLowerCase().includes(query);
				const nameMatch = feature.name.toLowerCase().includes(query);
				const typeMatch = feature.type.toLowerCase().includes(query);
				return idMatch || nameMatch || typeMatch;
			});
		}

		const pageItems = this.getCurrentPageItems();
		if (this.selectedIndex >= pageItems.length) {
			this.selectedIndex = Math.max(0, pageItems.length - 1);
		}
	}

	private getCurrentPageItems(): ApiFeature[] {
		const start = (this.page - 1) * this.pageSize;
		const end = start + this.pageSize;
		return this.filteredFeatures.slice(start, end);
	}

	getItems(): ApiFeature[] {
		return this.getCurrentPageItems();
	}

	getSelectedItem(): ApiFeature | null {
		const items = this.getCurrentPageItems();
		return items[this.selectedIndex] ?? null;
	}

	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	getPagination(): PaginationState {
		const items = this.getCurrentPageItems();
		const totalPages = Math.ceil(this.filteredFeatures.length / this.pageSize);
		return {
			page: this.page,
			pageSize: this.pageSize,
			hasMore: this.page < totalPages,
			totalLoaded: items.length,
		};
	}

	hasNextPage(): boolean {
		return this.page * this.pageSize < this.filteredFeatures.length;
	}

	hasPrevPage(): boolean {
		return this.page > 1;
	}

	getSearchQuery(): string {
		return this.searchQuery;
	}

	getTotalCount(): number {
		return this.filteredFeatures.length;
	}

	getTotalPages(): number {
		return Math.ceil(this.filteredFeatures.length / this.pageSize);
	}

	selectByIndex(index: number): ApiFeature | null {
		const items = this.getCurrentPageItems();
		if (index >= 0 && index < items.length) {
			this.selectedIndex = index;
			return items[index] ?? null;
		}
		return null;
	}

	selectById(id: string): ApiFeature | null {
		const items = this.getCurrentPageItems();
		const index = items.findIndex((f) => f.id === id);
		if (index !== -1) {
			this.selectedIndex = index;
			return items[index] ?? null;
		}
		return null;
	}

	selectPrev(): ApiFeature | null {
		if (this.selectedIndex > 0) {
			this.selectedIndex--;
			return this.getCurrentPageItems()[this.selectedIndex] ?? null;
		}
		return null;
	}

	selectNext(): ApiFeature | null {
		const items = this.getCurrentPageItems();
		if (this.selectedIndex < items.length - 1) {
			this.selectedIndex++;
			return items[this.selectedIndex] ?? null;
		}
		return null;
	}

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
		await this.fetchAllFeatures();
	}

	async getExpandedItem(id: string): Promise<ApiFeature | null> {
		const feature = this.allFeatures.find((f) => f.id === id);
		return feature ?? null;
	}

	toJSON(): ListControllerState<ApiFeature> {
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

		lines.push(`=== Features ===`);
		lines.push(
			`Page ${this.page}/${totalPages || 1} | ${items.length} items | ${this.filteredFeatures.length} total`,
		);

		if (this.searchQuery) {
			lines.push(`Search: "${this.searchQuery}"`);
		}

		if (!this.includeArchived) {
			lines.push(`(archived features hidden)`);
		}

		lines.push("");

		if (items.length === 0) {
			lines.push("No features found.");
		} else {
			lines.push("Features:");
			for (let i = 0; i < items.length; i++) {
				const f = items[i]!;
				const marker = i === this.selectedIndex ? ">" : " ";
				const name = f.name ?? "(no name)";
				const archived = f.archived ? " [archived]" : "";
				const consumable = f.consumable ? " [consumable]" : "";
				lines.push(
					`${marker} [${i}] ${f.id} | ${name} | ${f.type}${archived}${consumable}`,
				);
			}
		}

		if (selected) {
			lines.push("");
			lines.push(`Selected: ${selected.id}`);
			lines.push(`  Name: ${selected.name ?? "-"}`);
			lines.push(`  Type: ${selected.type}`);
			lines.push(`  Consumable: ${selected.consumable ? "yes" : "no"}`);
			lines.push(`  Archived: ${selected.archived ? "yes" : "no"}`);

			if (selected.event_names && selected.event_names.length > 0) {
				lines.push(`  Event Names: ${selected.event_names.join(", ")}`);
			}

			if (selected.display) {
				const singular = selected.display.singular ?? "-";
				const plural = selected.display.plural ?? "-";
				lines.push(`  Display: ${singular} / ${plural}`);
			}

			if (selected.credit_schema && selected.credit_schema.length > 0) {
				lines.push(`  Credit Schema:`);
				for (const credit of selected.credit_schema) {
					const cost = isGraduatedCreditSchemaItem(credit)
						? `${credit.tiers.length} graduated tiers`
						: `${credit.credit_cost} credits`;
					lines.push(`    - ${credit.metered_feature_id}: ${cost}`);
				}
			}
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

export async function createFeaturesController(
	options: FeaturesControllerOptions,
): Promise<FeaturesController> {
	const controller = new FeaturesController(options);
	await controller.refresh();
	return controller;
}
