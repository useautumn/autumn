import {
	type AutumnBillingPlan,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

export const replaceScheduledPhaseCustomerProductIds = async ({
	ctx,
	replacements,
}: {
	ctx: RepoContext;
	replacements?: AutumnBillingPlan["schedulePhaseCustomerProductReplacements"];
}) => {
	await Promise.all((replacements ?? []).map(async (replacement) => {
		const phases = await ctx.db
			.select({
				id: schedulePhases.id,
				customerProductIds: schedulePhases.customer_product_ids,
			})
			.from(schedulePhases)
			.innerJoin(schedules, eq(schedulePhases.schedule_id, schedules.id))
			.where(
				and(
					eq(schedules.org_id, ctx.org.id),
					eq(schedules.env, ctx.env),
					eq(schedules.internal_customer_id, replacement.internalCustomerId),
					replacement.internalEntityId
						? eq(schedules.internal_entity_id, replacement.internalEntityId)
						: isNull(schedules.internal_entity_id),
				),
			);

		await Promise.all(
			phases
				.filter((phase) =>
					phase.customerProductIds.includes(replacement.oldCustomerProductId),
				)
				.map((phase) =>
					ctx.db
						.update(schedulePhases)
						.set({
							customer_product_ids: phase.customerProductIds.map((id) =>
								id === replacement.oldCustomerProductId
									? replacement.newCustomerProductId
									: id,
							),
						})
						.where(eq(schedulePhases.id, phase.id)),
				),
		);
	}));
};
