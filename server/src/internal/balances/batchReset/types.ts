import type { Rollover } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ResetUpdates } from "@/internal/customers/actions/resetCustomerEntitlements/processReset.js";
import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";

export type BatchResetCustomerEntitlementsV2Payload = {
	customerEntitlementIds: string[];
};

export type BatchResetGroup = {
	ctx: AutumnContext;
	customerEntitlements: ResetContextCustomerEntitlement[];
};

export type BatchResetContext = {
	/** One group per unique org+env found in the batch, each with its own
	 * worker context (org + features loaded once per group). */
	groups: BatchResetGroup[];
	missingIds: string[];
};

/** Every non-resettable candidate receives exactly one verdict. */
export type ResetVerdict = {
	kind:
		| "resets_via_invoice"
		| "should_expire"
		| "clear_next_reset"
		| "no_action";
	customerEntitlementId: string;
	reason?: "product_past_due" | "product_not_active" | "not_due";
	unlimited?: boolean;
};

export type ResetMutation = {
	customerEntitlementId: string;
	/** next_reset_at the mutation was computed from. The execute UPDATE only
	 * applies while the row still matches (optimistic guard), so a concurrent
	 * duplicate — a lazy reset racing the worker, or an SQS redelivery —
	 * no-ops instead of double-applying balances and rollovers. */
	expectedNextResetAt: number;
	updates: ResetUpdates;
	rolloverInserts: Rollover[];
	rolloverUpdates: Rollover[];
	rolloverDeleteIds: string[];
};

export type VerdictMutations = {
	expireCustomerEntitlementIds: string[];
	/** Price-backed on a live subscription: flag so the scan skips them. */
	resetByInvoiceCustomerEntitlementIds: string[];
};
