import { type SQL, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/**
 * One statement of data-modifying CTEs = the whole rename is atomic without a
 * long transaction. Moves every version row of the plan (including siblings
 * outside this batch) plus every plan-id reference. Same-table touches are
 * merged — Postgres rejects updating a row twice in one statement.
 */
const buildPlanRenameSql = ({
	orgId,
	env,
	renamePlan,
}: {
	orgId: string;
	env: string;
	renamePlan: RenameProductPlan;
}): SQL => {
	const { planId, toId } = renamePlan;

	return sql`
		WITH upd_products AS (
			UPDATE products
			SET id = ${toId}
			WHERE org_id = ${orgId} AND env = ${env} AND id = ${planId}
			RETURNING 1
		),
		upd_reward_programs AS (
			UPDATE reward_programs
			SET product_ids = array_replace(product_ids, ${planId}, ${toId})
			WHERE org_id = ${orgId} AND env = ${env}
				AND ${planId} = ANY(product_ids)
			RETURNING 1
		),
		upd_rewards AS (
			UPDATE rewards
			SET
				free_product_id = CASE
					WHEN free_product_id = ${planId} THEN ${toId}
					ELSE free_product_id
				END,
				discount_config = CASE
					WHEN discount_config -> 'product_ids' ? ${planId}
					THEN jsonb_set(
						discount_config,
						'{product_ids}',
						(
							SELECT to_jsonb(array_agg(
								CASE WHEN elem = ${planId} THEN ${toId} ELSE elem END
							))
							FROM jsonb_array_elements_text(discount_config -> 'product_ids') AS elem
						)
					)
					ELSE discount_config
				END
			WHERE org_id = ${orgId} AND env = ${env}
				AND (
					free_product_id = ${planId}
					OR discount_config -> 'product_ids' ? ${planId}
				)
			RETURNING 1
		),
		upd_revenuecat_mappings AS (
			UPDATE revenuecat_mappings
			SET autumn_product_id = ${toId}
			WHERE org_id = ${orgId} AND env = ${env}
				AND autumn_product_id = ${planId}
			RETURNING 1
		),
		del_aliases AS (
			DELETE FROM product_aliases
			WHERE org_id = ${orgId} AND env = ${env}
				AND (canonical_plan_id = ${planId} OR alias_id = ${toId})
			RETURNING 1
		),
		ins_aliases AS (
			INSERT INTO product_aliases (
				org_id, env, alias_id, canonical_plan_id, created_at
			)
			VALUES (
				${orgId},
				${env},
				${planId},
				${toId},
				ROUND(date_part('epoch', NOW()) * 1000)::BIGINT
			)
			RETURNING 1
		)
		SELECT 1
	`;
};

export const executeRenamePlans = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	for (const renamePlan of updateCatalogPlan.renamePlans) {
		await ctx.db.execute(
			buildPlanRenameSql({
				orgId: ctx.org.id,
				env: ctx.env,
				renamePlan,
			}),
		);
	}
};
