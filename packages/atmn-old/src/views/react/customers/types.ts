import type { ApiCustomer } from "../../../lib/api/endpoints/customers.js";
import type { AppEnv } from "../../../lib/env/detect.js";
import type { FocusTarget } from "../../../lib/hooks/useCustomerNavigation.js";

export type FeatureType = "boolean" | "metered" | "credit_system";

export interface FeatureDisplay {
	singular?: string | null;
	plural?: string | null;
}

export interface ApiFeature {
	id: string;
	name: string;
	type: FeatureType;
	consumable: boolean;
	event_names?: string[];
	display?: FeatureDisplay;
	archived: boolean;
}

export interface ApiBalanceReset {
	interval: string;
	interval_count?: number;
	resets_at: number | null;
}

export interface ApiBalance {
	feature_id: string;
	feature?: ApiFeature;
	unlimited: boolean;
	granted_balance: number;
	purchased_balance: number;
	current_balance: number;
	usage: number;
	overage_allowed: boolean;
	max_purchase: number | null;
	reset: ApiBalanceReset | null;
	plan_id: string | null;
}

export interface ApiPlan {
	id: string;
	name: string;
	description: string | null;
	group: string | null;
	version: number;
	add_on: boolean;
	default: boolean;
	created_at: number;
	env: string;
	archived: boolean;
}

export interface ApiSubscription {
	plan?: ApiPlan;
	plan_id: string;
	default: boolean;
	add_on: boolean;
	status: "active" | "scheduled" | "expired";
	past_due: boolean;
	canceled_at: number | null;
	expires_at: number | null;
	trial_ends_at: number | null;
	started_at: number;
	current_period_start: number | null;
	current_period_end: number | null;
	quantity: number;
}

export interface ApiEntity {
	autumn_id?: string;
	id: string | null;
	name: string | null;
	customer_id?: string | null;
	feature_id?: string | null;
	created_at: number;
	env: string;
}

export interface ApiInvoice {
	plan_ids: string[];
	stripe_id: string;
	status: string;
	total: number;
	currency: string;
	created_at: number;
	hosted_invoice_url?: string | null;
}

export interface ApiReferral {
	program_id: string;
	customer: {
		id: string;
		name?: string | null;
		email?: string | null;
	};
	reward_applied: boolean;
	created_at: number;
}

export interface ApiDiscount {
	id: string;
	name: string;
	type:
		| "percentage_discount"
		| "fixed_discount"
		| "free_product"
		| "invoice_credits";
	discount_value: number;
	duration_type: "one_off" | "months" | "forever";
	duration_value?: number | null;
	currency?: string | null;
	start?: number | null;
	end?: number | null;
}

export interface ApiRewards {
	discounts: ApiDiscount[];
}

export interface ApiCustomerExpanded
	extends Omit<
		ApiCustomer,
		"subscriptions" | "scheduled_subscriptions" | "balances"
	> {
	subscriptions: ApiSubscription[];
	scheduled_subscriptions: ApiSubscription[];
	balances: Record<string, ApiBalance>;
	invoices?: ApiInvoice[];
	entities?: ApiEntity[];
	rewards?: ApiRewards | null;
	referrals?: ApiReferral[];
}

export interface ColumnWidths {
	colId: number;
	colName: number;
	colEmail: number;
	colCreated: number;
	shouldTruncate: boolean;
}

export interface PaginationInfo {
	page: number;
	display: string;
	canGoPrev: boolean;
	canGoNext: boolean;
}

export interface TitleBarProps {
	environment: AppEnv;
	pagination: PaginationInfo;
	searchQuery?: string;
}

export interface CustomersTableProps {
	customers: ApiCustomer[];
	selectedIndex: number;
	onSelect: (customer: ApiCustomer, index: number) => void;
	isFocused: boolean;
}

export interface CustomerRowProps {
	customer: ApiCustomer;
	isSelected: boolean;
	isFocused: boolean;
	columnWidths: ColumnWidths;
}

export interface CustomerSheetProps {
	customer: ApiCustomer;
	isFocused: boolean;
	copiedFeedback: boolean;
	onCopy: () => void;
	onOpenInBrowser: () => void;
	expandedCustomer?: ApiCustomerExpanded;
	isLoadingExpanded?: boolean;
	expandedError?: Error | null;
}

export interface KeybindHintsProps {
	focusTarget: FocusTarget;
	sheetOpen: boolean;
	canGoPrev: boolean;
	canGoNext: boolean;
}

export interface EmptyStateProps {
	environment: AppEnv;
	searchQuery?: string;
}

export interface ErrorStateProps {
	error: Error;
	onRetry: () => void;
}

export interface LoadingStateProps {
	environment: AppEnv;
}

export function formatDate(timestamp: number): string {
	const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
	const date = new Date(ms);
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function truncate(str: string | null, maxLength: number): string {
	if (!str) return "-";
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 3)}...`;
}

export function getPaginationDisplay(
	page: number,
	itemCount: number,
	pageSize: number,
	hasMore: boolean,
): PaginationInfo {
	let display: string;
	let canGoNext: boolean;

	if (page === 1) {
		if (itemCount < pageSize) {
			display = "Page 1 (only)";
			canGoNext = false;
		} else {
			display = "Page 1";
			canGoNext = true;
		}
	} else {
		if (hasMore) {
			display = `Page ${page} of many`;
			canGoNext = true;
		} else {
			display = `Page ${page} (last)`;
			canGoNext = false;
		}
	}

	return {
		page,
		display,
		canGoPrev: page > 1,
		canGoNext,
	};
}

const COL_CREATED = 14;

const ROW_OVERHEAD = 5;
const TABLE_OVERHEAD = 4;
const SHEET_WIDTH = 45;

export function calculateColumnWidths(
	customers: ApiCustomer[],
	terminalColumns: number,
	sheetOpen: boolean = false,
): ColumnWidths {
	const sheetReserved = sheetOpen ? SHEET_WIDTH : 0;
	const availableWidth =
		terminalColumns - TABLE_OVERHEAD - sheetReserved - ROW_OVERHEAD;

	let maxIdLen = 2;
	let maxNameLen = 4;
	let maxEmailLen = 5;

	for (const customer of customers) {
		if (customer.id) maxIdLen = Math.max(maxIdLen, customer.id.length);
		if (customer.name) maxNameLen = Math.max(maxNameLen, customer.name.length);
		if (customer.email)
			maxEmailLen = Math.max(maxEmailLen, customer.email.length);
	}

	const totalContentWidth = maxIdLen + maxNameLen + maxEmailLen + COL_CREATED;

	if (totalContentWidth <= availableWidth) {
		return {
			colId: maxIdLen,
			colName: maxNameLen,
			colEmail: maxEmailLen,
			colCreated: COL_CREATED,
			shouldTruncate: false,
		};
	}

	const spaceForVariableColumns = availableWidth - COL_CREATED;
	const totalVariableContent = maxIdLen + maxNameLen + maxEmailLen;

	const ratio = spaceForVariableColumns / totalVariableContent;
	const colId = Math.max(8, Math.floor(maxIdLen * ratio));
	const colName = Math.max(8, Math.floor(maxNameLen * ratio));
	const colEmail = Math.max(8, spaceForVariableColumns - colId - colName);

	return {
		colId,
		colName,
		colEmail,
		colCreated: COL_CREATED,
		shouldTruncate: true,
	};
}
