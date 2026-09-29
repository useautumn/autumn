import type {
	CusProductStatus,
	CustomerEntitlementFilters,
} from "@autumn/shared";
import type { OverageBehavior } from "../../commands/track/types/trackCommand.js";
import type { JsonValue } from "../../models/common/json.js";

/** Which rows fund the feature and how they are read. Equal selections select the same rows, so one context serves both. */
export type DeductionSelection = {
	featureId: string;
	/** The feature's catalog internal id; credit usage is attributed under it. */
	internalFeatureId: string;
	now: number;
	/** The event's properties; filtered caps and dimensioned rates read them. */
	properties: Record<string, JsonValue> | null;
	/** Credit systems that fund the feature are drawn after its own rows; off, only the feature's own rows are. */
	includesCreditSystems: boolean;
	/** Consumption checks and counts windowed caps; a balance set to a target does neither. */
	countsUsageWindows: boolean;
	/** Narrows the selected rows to one balance, entitlement or interval. */
	customerEntitlementFilters?: CustomerEntitlementFilters;
	/** The product statuses that fund, from the org's `include_past_due`. */
	inStatuses: CusProductStatus[];
	/** The org's `reverse_deduction_order`. */
	reverseOrder: boolean;
	/** Past-due products stop funding: the org blocks overdue usage and this request honours it (a check does, a track does not). */
	blocksOverdue: boolean;
};

/** How far the selected rows may move in one draw. */
export type DeductionTerms = {
	overageBehavior: OverageBehavior;
	/** Off lets overage run past the spend limit: a balance set to a target must land on it. */
	enforcesSpendLimit: boolean;
};

/** What a command asks the deduction for: the rows, the terms of the draw, and the units. Negative units refund. */
export type DeductionRequest = {
	selection: DeductionSelection;
	terms: DeductionTerms;
	value: number;
};
