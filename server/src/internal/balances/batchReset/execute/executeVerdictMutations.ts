import { customerEntitlements } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { resetCronQueryTag } from "../resetCronQueryTag.js";
import type { VerdictMutations } from "../types.js";

export const executeVerdictMutations = async ({
	db,
	verdictMutations,
}: {
	db: DrizzleCli;
	verdictMutations: VerdictMutations;
}) => {
	const { expireCustomerEntitlementIds, resetByInvoiceCustomerEntitlementIds } =
		verdictMutations;

	if (expireCustomerEntitlementIds.length > 0) {
		await db.execute(sql`
			UPDATE ${customerEntitlements}
			SET expired = true
			WHERE id = ANY(${sql.param(expireCustomerEntitlementIds)}::text[])
				AND expired IS NOT TRUE
			${resetCronQueryTag("expireEntitlements")}
		`);
	}

	if (resetByInvoiceCustomerEntitlementIds.length > 0) {
		await db.execute(sql`
			UPDATE ${customerEntitlements}
			SET reset_by_invoice = true
			WHERE id = ANY(${sql.param(resetByInvoiceCustomerEntitlementIds)}::text[])
				AND reset_by_invoice IS NOT TRUE
			${resetCronQueryTag("markInvoiceReset")}
		`);
	}
};
