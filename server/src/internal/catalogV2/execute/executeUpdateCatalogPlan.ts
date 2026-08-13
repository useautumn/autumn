import type { CatalogAction, CatalogMigration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import {
	coalesceCreditSystemSchemaRewrites,
	executeCreditSystemSchemaRewrites,
	executeFeatureReferenceRewrites,
} from "@/internal/catalogV2/execute/executeFeatureReferenceRewrites";
import { executeMigrationDrafts } from "@/internal/catalogV2/execute/executeMigrationDrafts";
import { executeUpsertProducts } from "@/internal/catalogV2/execute/executeUpsertProducts/executeUpsertProducts";
import { FeatureService } from "@/internal/features/FeatureService.js";
import type { ClearCreditSystemCachePayload } from "@/internal/features/featureActions/runClearCreditSystemCacheTask.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { workflows } from "@/queue/workflows.js";

export type CatalogAppliedResult = { id: string; action: CatalogAction };

export type CatalogResult = {
	features: CatalogAppliedResult[];
	plans: CatalogAppliedResult[];
	migrations: CatalogMigration[];
};

const executeInsertFeatures = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	if (updateCatalogPlan.insertFeatures.length === 0) return;
	await FeatureService.insert({
		db: ctx.db,
		data: updateCatalogPlan.insertFeatures,
		logger: ctx.logger,
	});
	for (const feature of updateCatalogPlan.insertFeatures) {
		await workflows.triggerGenerateFeatureDisplay({
			featureId: feature.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
	}
};

const executeUpdateFeatures = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	const ops = updateCatalogPlan.updateFeatures.filter(
		(updateFeaturePlan) => updateFeaturePlan.previousAttributes !== null,
	);

	await Promise.all(
		ops.map((updateFeaturePlan) =>
			executeFeatureReferenceRewrites({ ctx, updateFeaturePlan }),
		),
	);

	await executeCreditSystemSchemaRewrites({
		ctx,
		updateCreditSystemSchemas: coalesceCreditSystemSchemaRewrites({
			updateFeatures: updateCatalogPlan.updateFeatures,
		}),
	});

	await Promise.all(
		ops.map((op) =>
			FeatureService.update({
				db: ctx.db,
				id: op.current.id,
				orgId: ctx.org.id,
				env: ctx.env,
				updates: {
					id: op.next.id,
					name: op.next.name,
					type: op.next.type,
					archived: op.next.archived,
					event_names: op.next.event_names,
					config: op.next.config,
					model_markups: op.next.model_markups,
					display: op.next.display,
				},
			}),
		),
	);

	for (const op of ops) {
		if (op.regenerateDisplay) {
			await workflows.triggerGenerateFeatureDisplay({
				featureId: op.next.id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
		}
		if (op.clearCreditSystemCache) {
			await addTaskToQueue({
				jobName: JobName.ClearCreditSystemCustomerCache,
				payload: {
					orgId: ctx.org.id,
					env: ctx.env,
					internalFeatureId: op.current.internal_id,
				} satisfies ClearCreditSystemCachePayload,
			});
		}
	}
};

const executeRemoveFeatures = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}) => {
	await Promise.all(
		updateCatalogPlan.removeFeatures
			.filter((removeFeaturePlan) => removeFeaturePlan.current != null)
			.map((removeFeaturePlan) => {
				const current = removeFeaturePlan.current!;
				return removeFeaturePlan.willArchive
					? FeatureService.update({
							db: ctx.db,
							id: current.id,
							orgId: ctx.org.id,
							env: ctx.env,
							updates: { archived: true },
						})
					: FeatureService.delete({
							db: ctx.db,
							orgId: ctx.org.id,
							featureId: current.id,
							env: ctx.env,
						});
			}),
	);
};

/** Persist the plan — dumb writers only, every op was computed upstream. */
export const executeUpdateCatalogPlan = async ({
	ctx,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<CatalogResult> => {
	await executeInsertFeatures({ ctx, updateCatalogPlan });
	await executeUpdateFeatures({ ctx, updateCatalogPlan });
	await executeRemoveFeatures({ ctx, updateCatalogPlan });
	const plans = await executeUpsertProducts({ ctx, updateCatalogPlan });
	const migrations = await executeMigrationDrafts({ ctx, updateCatalogPlan });

	await clearOrgCache({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		logger: ctx.logger,
	});

	return {
		features: [
			...updateCatalogPlan.insertFeatures.map((feature) => ({
				id: feature.id,
				action: "create" as const,
			})),
			...updateCatalogPlan.updateFeatures.map((updateFeaturePlan) => ({
				id: updateFeaturePlan.next.id,
				action: updateFeaturePlan.previousAttributes
					? ("update" as const)
					: ("none" as const),
			})),
			...updateCatalogPlan.removeFeatures.map((removeFeaturePlan) => ({
				id: removeFeaturePlan.featureId,
				action: "delete" as const,
			})),
		],
		plans,
		migrations,
	};
};
