import { customerEntitlements } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { PublishedBalanceTransition } from "@/internal/customers/cache/fullSubject/actions/publishCachedFullSubject.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";

export const persistPublishedBalanceTransitions = async ({
	db,
	logger,
	balanceTransitions,
}: {
	db: DrizzleCli;
	logger: Logger;
	balanceTransitions: PublishedBalanceTransition[];
}): Promise<void> => {
	if (balanceTransitions.length === 0) return;

	const transitionRows = balanceTransitions.map(
		({ customerEntitlementId, expected, published }) => ({
			id: customerEntitlementId,
			expected_balance: expected.balance,
			expected_adjustment: expected.adjustment,
			expected_additional_balance: expected.additionalBalance,
			expected_cache_version: expected.cacheVersion,
			expected_next_reset_at: expected.nextResetAt,
			balance: published.balance,
			adjustment: published.adjustment,
			additional_balance: published.additionalBalance,
		}),
	);

	const updatedRows = await db.execute<{ id: string }>(sql`
		UPDATE ${customerEntitlements} AS customer_entitlement
		SET
			balance = transition.balance,
			adjustment = transition.adjustment,
			additional_balance = transition.additional_balance
		FROM jsonb_to_recordset(${JSON.stringify(transitionRows)}::jsonb) AS transition(
			id text,
			expected_balance numeric,
			expected_adjustment numeric,
			expected_additional_balance numeric,
			expected_cache_version integer,
			expected_next_reset_at numeric,
			balance numeric,
			adjustment numeric,
			additional_balance numeric
		)
		WHERE customer_entitlement.id = transition.id
			AND customer_entitlement.balance = transition.expected_balance
			AND COALESCE(customer_entitlement.adjustment, 0) = transition.expected_adjustment
			AND customer_entitlement.additional_balance = transition.expected_additional_balance
			AND COALESCE(customer_entitlement.cache_version, 0) = transition.expected_cache_version
			AND customer_entitlement.next_reset_at IS NOT DISTINCT FROM transition.expected_next_reset_at
		RETURNING customer_entitlement.id
		${planetScaleTag({ query: "persistPublishedBalanceTransitions" })}
	`);

	if (updatedRows.length !== balanceTransitions.length) {
		logger.info(
			`[persistPublishedBalanceTransitions] Skipped ${balanceTransitions.length - updatedRows.length} balance(s) already changed after publication`,
		);
	}
};

export const persistOrQueuePublishedBalanceTransitions = async ({
	ctx,
	customerId,
	balanceTransitions,
}: {
	ctx: AutumnContext;
	customerId: string;
	balanceTransitions: PublishedBalanceTransition[];
}): Promise<void> => {
	try {
		await persistPublishedBalanceTransitions({
			db: ctx.db,
			logger: ctx.logger,
			balanceTransitions,
		});
	} catch (persistenceError) {
		try {
			await addTaskToQueue({
				jobName: JobName.PersistPublishedBalanceTransitions,
				payload: {
					orgId: ctx.org.id,
					env: ctx.env,
					customerId,
					requestId: ctx.id,
					balanceTransitions,
				},
				messageGroupId: `${ctx.org.id}:${ctx.env}:${customerId}`,
			});
			ctx.logger.warn(
				{ error: persistenceError },
				"[persistPublishedBalanceTransitions] Immediate persistence failed; queued a guarded retry",
			);
		} catch (queueError) {
			ctx.logger.error(
				{ persistenceError, queueError },
				"[persistPublishedBalanceTransitions] Failed to persist or queue the published balance",
			);
		}
	}
};
