import type { CommandOrg } from "@autumn/balance-engine";
import type { Organization } from "@autumn/shared";

/** The org settings a check reads and nothing else: an Atom keeps them in the org's own cloud. */
export const orgToAtomOrg = ({ org }: { org: Organization }): CommandOrg => ({
	config: {
		reverse_deduction_order: org.config.reverse_deduction_order,
		block_overdue_entitlements: org.config.block_overdue_entitlements,
		include_past_due: org.config.include_past_due,
	},
});
