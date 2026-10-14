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
	groups: BatchResetGroup[];
	missingIds: string[];
};

export type ResetVerdict = {
	kind:
		| "resets_via_invoice"
		| "should_expire"
		| "clear_next_reset"
		| "no_action";
	customerEntitlementId: string;
	reason?:
		| "product_past_due"
		| "product_not_active"
		| "not_due"
		| "pooled_balance_source"
		| "pooled_balance_missing"
		| "pooled_balance_lifetime";
	unlimited?: boolean;
};

export type ResetMutation = {
	customerEntitlementId: string;
	expectedNextResetAt: number;
	updates: ResetUpdates;
	rolloverInserts: Rollover[];
	rolloverUpdates: Rollover[];
	rolloverDeleteIds: string[];
};

export type VerdictMutations = {
	expireCustomerEntitlementIds: string[];
	resetByInvoiceCustomerEntitlementIds: string[];
};
