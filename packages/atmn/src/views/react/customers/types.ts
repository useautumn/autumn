import type { ApiCustomer } from "../../../lib/api/endpoints/customers.js";
import type { AppEnv } from "../../../lib/env/detect.js";
import type { FocusTarget } from "../../../lib/hooks/useCustomerNavigation.js";

// ========================================
// Expanded Customer Types
// ========================================

/**
 * Feature types
 */
export type FeatureType = "boolean" | "metered" | "credit_system";

/**
 * Feature display configuration
 */
export interface FeatureDisplay {
	singular?: string | null;
	plural?: string | null;
}

/**
 * Feature definition (expanded from balance)
 */
export interface ApiFeature {
	id: string;
	name: string;
	type: FeatureType;
	consumable: boolean;
	event_names?: string[];
	display?: FeatureDisplay;
	archived: boolean;
}

/**
 * Balance reset configuration
 */
export interface ApiBalanceReset {
	interval: string;
	interval_count?: number;
	resets_at: number | null;
}

/**
 * Customer balance for a feature
 */
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

/**
 * Plan definition (expanded from subscription)
 */
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

/**
 * Customer subscription
 */
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

/**
 * Customer entity
 */
export interface ApiEntity {
	autumn_id?: string;
	id: string | null;
	name: string | null;
	customer_id?: string | null;
	feature_id?: string | null;
	created_at: number;
	env: string;
}

/**
 * Invoice
 */
export interface ApiInvoice {
	plan_ids: string[];
	stripe_id: string;
	status: string;
	total: number;
	currency: string;
	created_at: number;
	hosted_invoice_url?: string | null;
}

/**
 * Referral
 */
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

/**
 * Discount/Reward
 */
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

/**
 * Rewards container
 */
export interface ApiRewards {
	discounts: ApiDiscount[];
}

/**
 * Full expanded customer with all optional expand fields
 */
export interface ApiCustomerExpanded
	extends Omit<
		ApiCustomer,
		"subscriptions" | "scheduled_subscriptions" | "balances"
	> {
	subscriptions: ApiSubscription[];
	scheduled_subscriptions: ApiSubscription[];
	balances: Record<string, ApiBalance>;
	// Expanded fields
	invoices?: ApiInvoice[];
	entities?: ApiEntity[];
	rewards?: ApiRewards | null;
	referrals?: ApiReferral[];
}

/**
 * Column widths for the customer table
 */
export interface ColumnWidths {
	colId: number;
	colName: number;
	colEmail: number;
	colCreated: number;
	/** Whether truncation is needed based on terminal width */
	shouldTruncate: boolean;
}

/**
 * Pagination display information
 */
export interface PaginationInfo {
	/** Current page number (1-indexed) */
	page: number;
	/** Display text for the page indicator */
	display: string;
	/** Can navigate to previous page */
	canGoPrev: boolean;
	/** Can navigate to next page (based on API response) */
	canGoNext: boolean;
}

/**
 * Props for the TitleBar component
 */
export interface TitleBarProps {
	environment: AppEnv;
	pagination: PaginationInfo;
	searchQuery?: string;
}

/**
 * Props for the CustomersTable component
 */
export interface CustomersTableProps {
	customers: ApiCustomer[];
	selectedIndex: number;
	onSelect: (customer: ApiCustomer, index: number) => void;
	isFocused: boolean;
}

/**
 * Props for the CustomerRow component
 */
export interface CustomerRowProps {
	customer: ApiCustomer;
	isSelected: boolean;
	isFocused: boolean;
	columnWidths: ColumnWidths;
}

/**
 * Props for the CustomerSheet component
 */
export interface CustomerSheetProps {
	customer: ApiCustomer;
	isFocused: boolean;
	copiedFeedback: boolean;
	onCopy: () => void;
	onOpenInBrowser: () => void;
	/** Expanded customer data (lazily loaded) */
	expandedCustomer?: ApiCustomerExpanded;
	/** Whether expanded data is loading */
	isLoadingExpanded?: boolean;
	/** Error loading expanded data */
	expandedError?: Error | null;
}

/**
 * Props for the KeybindHints component
 */
export interface KeybindHintsProps {
	focusTarget: FocusTarget;
	sheetOpen: boolean;
	canGoPrev: boolean;
	canGoNext: boolean;
}

/**
 * Props for the EmptyState component
 */
export interface EmptyStateProps {
	environment: AppEnv;
	searchQuery?: string;
}

/**
 * Props for the ErrorState component
 */
export interface ErrorStateProps {
	error: Error;
	onRetry: () => void;
}

/**
 * Props for the LoadingState component
 */
export interface LoadingStateProps {
	environment: AppEnv;
}

/**
 * Utility function to format customer dates
 * Handles both Unix timestamps (seconds) and JS timestamps (milliseconds)
 */
export function formatDate(timestamp: number): string {
	// If timestamp is less than ~10 billion, it's in seconds (Unix), convert to ms
	// Otherwise it's already in milliseconds
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

/**
 * Truncate a string to a maximum length with ellipsis
 */
export function truncate(str: string | null, maxLength: number): string {
	if (!str) return "-";
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Calculate pagination display text based on API response
 */
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
			// Certain: no more pages
			display = "Page 1 (only)";
			canGoNext = false;
		} else {
			// Uncertain: might be more
			display = "Page 1";
			canGoNext = true; // Allow attempting next page
		}
	} else {
		if (hasMore) {
			// Certain: more exists
			display = `Page ${page} of many`;
			canGoNext = true;
		} else {
			// Certain: end reached
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

// Fixed column width for created date (always the same format: "Jan 1, 2025")
const COL_CREATED = 14;

// Row overhead: marker (2) + 3 column margins (3) = 5
// Table overhead: border left (1) + border right (1) + paddingX (2) = 4
// Sheet when open: minWidth (44) + margin (1) = 45
const ROW_OVERHEAD = 5;
const TABLE_OVERHEAD = 4;
const SHEET_WIDTH = 45;

/**
 * Calculate column widths based on ACTUAL customer data.
 * Shows full content by default, only truncates if total row width exceeds available space.
 *
 * @param customers - Array of customers to measure
 * @param terminalColumns - process.stdout.columns
 * @param sheetOpen - whether the detail sheet is open
 */
export function calculateColumnWidths(
	customers: ApiCustomer[],
	terminalColumns: number,
	sheetOpen: boolean = false,
): ColumnWidths {
	// Calculate available width for table content
	const sheetReserved = sheetOpen ? SHEET_WIDTH : 0;
	const availableWidth =
		terminalColumns - TABLE_OVERHEAD - sheetReserved - ROW_OVERHEAD;

	// Find maximum actual content widths from data
	let maxIdLen = 2; // minimum "ID" header
	let maxNameLen = 4; // minimum "Name" header
	let maxEmailLen = 5; // minimum "Email" header

	for (const customer of customers) {
		if (customer.id) maxIdLen = Math.max(maxIdLen, customer.id.length);
		if (customer.name) maxNameLen = Math.max(maxNameLen, customer.name.length);
		if (customer.email)
			maxEmailLen = Math.max(maxEmailLen, customer.email.length);
	}

	// Total width needed to show all content
	const totalContentWidth = maxIdLen + maxNameLen + maxEmailLen + COL_CREATED;

	// If everything fits, use actual content widths (no truncation)
	if (totalContentWidth <= availableWidth) {
		return {
			colId: maxIdLen,
			colName: maxNameLen,
			colEmail: maxEmailLen,
			colCreated: COL_CREATED,
			shouldTruncate: false,
		};
	}

	// Need to truncate - distribute available space proportionally
	// Created column is fixed, distribute rest among id/name/email
	const spaceForVariableColumns = availableWidth - COL_CREATED;
	const totalVariableContent = maxIdLen + maxNameLen + maxEmailLen;

	// Calculate proportional widths (with minimum of 8 chars each)
	const ratio = spaceForVariableColumns / totalVariableContent;
	const colId = Math.max(8, Math.floor(maxIdLen * ratio));
	const colName = Math.max(8, Math.floor(maxNameLen * ratio));
	// Email gets remaining space
	const colEmail = Math.max(8, spaceForVariableColumns - colId - colName);

	return {
		colId,
		colName,
		colEmail,
		colCreated: COL_CREATED,
		shouldTruncate: true,
	};
}
