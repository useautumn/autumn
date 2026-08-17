import { schedulePhases, schedules } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { RepoContext } from "@/db/repoContext.js";

const CustomerScheduleWithPhasesSchema = z.object({
	id: z.string(),
	/** Ordered by start date, so the opening phase is always first. */
	phases: z.array(
		z.object({
			starts_at: z.coerce.number(),
			customer_product_ids: z.array(z.string()),
		}),
	),
});

export type CustomerScheduleWithPhases = z.infer<
	typeof CustomerScheduleWithPhasesSchema
>;

/**
 * Every schedule the customer owns, with its phases attached. One round trip:
 * the nesting is assembled in SQL rather than fetched as two queries and
 * stitched by id.
 */
export const selectCustomerSchedulesWithPhases = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: RepoContext;
	internalCustomerId: string;
}): Promise<CustomerScheduleWithPhases[]> => {
	const rows = await ctx.db.execute(sql`
		SELECT
			s.id,
			COALESCE(
				(
					SELECT json_agg(phase ORDER BY phase.starts_at ASC)
					FROM (
						SELECT p.starts_at, p.customer_product_ids
						FROM ${schedulePhases} p
						WHERE p.schedule_id = s.id
					) phase
				),
				'[]'::json
			) AS phases
		FROM ${schedules} s
		WHERE s.internal_customer_id = ${internalCustomerId}
	`);

	return rows.flatMap((row) => {
		const parsed = CustomerScheduleWithPhasesSchema.safeParse(row);
		if (parsed.success) return [parsed.data];

		ctx.logger.error(
			"selectCustomerSchedulesWithPhases: invalid schedule row",
			{
				error: parsed.error,
				row,
			},
		);
		return [];
	});
};
