import { customerEntitlements } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { resetCronQueryTag } from "@/internal/balances/batchReset/resetCronQueryTag.js";
import { resetEligibleFilterSql } from "./getResetEligibleCustomerEntitlementsPage.js";

export const buildCountResetEligibleQuery = ({
	dueBefore,
	cap,
}: {
	dueBefore: number;
	cap: number;
}) => sql`
	SELECT count(*)::int AS count
	FROM (
		SELECT 1
		FROM ${customerEntitlements}
		WHERE ${resetEligibleFilterSql({ dueBefore })}
		LIMIT ${cap}
	) eligible
	${resetCronQueryTag("countEligible")}
`;

export const countResetEligibleCustomerEntitlements = async ({
	db,
	dueBefore,
	cap,
}: {
	db: DrizzleCli;
	dueBefore: number;
	cap: number;
}): Promise<{ count: number; capped: boolean }> => {
	const rows = await db.execute<{ count: number }>(
		buildCountResetEligibleQuery({ dueBefore, cap }),
	);

	const count = rows[0]?.count ?? 0;
	return { count, capped: count >= cap };
};
