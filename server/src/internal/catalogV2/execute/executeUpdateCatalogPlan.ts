import type { CatalogAction, CatalogMigration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type CatalogPhases,
	timeCatalogPhase,
} from "@/internal/catalogV2/actions/updateCatalog/setup/timeCatalogPhase";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import {
	coalesceCreditSystemSchemaRewrites,
	executeCreditSystemSchemaRewrites,
	executeFeatureReferenceRewrites,
} from "@/internal/catalogV2/execute/executeFeatureReferenceRewrites";
import { initStripeResourcesForCatalog } from "@/internal/catalogV2/execute/executeInitStripeResources/initStripeResourcesForCatalog";
import { executeMigrationDrafts } from "@/internal/catalogV2/execute/executeMigrationDrafts";
import { executeRevenueCatMappings } from "./executeRevenueCatMappings";
import { executeRemovePlans } from "@/internal/catalogV2/execute/executeRemovePlans";
import { executeRenamePlans } from "@/internal/catalogV2/execute/executeRenamePlans";
import { executeUpsertProducts } from "@/internal/catalogV2/execute/executeUpsertProducts/executeUpsertProducts";
import { queueRewardMigrations } from "@/internal/catalogV2/execute/queueRewardMigrations";
import { rewritePublicPlanIdsAfterRename } from "@/internal/catalogV2/execute/rewritePublicPlanIdsAfterRename";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { fillFeatureStripeMeterEventName } from "@/internal/features/utils/fillFeatureStripeMeterEventName.js";
import { updateFeatureStripeProductName } from "@/internal/features/utils/updateFeatureStripeProductName.js";
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
	const insertFeatures = await Promise.all(
		updateCatalogPlan.insertFeatures.map((feature) =>
			fillFeatureStripeMeterEventName({ ctx, feature }),
		),
	);
	await FeatureService.insert({
		db: ctx.db,
		data: insertFeatures,
		logger: ctx.logger,
	});
	for (const feature of insertFeatures) {
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
		ops.map(async (op) => {
			const next = await fillFeatureStripeMeterEventName({
				ctx,
				feature: op.next,
			});
			return FeatureService.update({
				db: ctx.db,
				id: op.current.id,
				orgId: ctx.org.id,
				env: ctx.env,
				updates: {
					id: next.id,
					name: next.name,
					type: next.type,
					archived: next.archived,
					event_names: next.event_names,
					config: next.config,
					model_markups: next.model_markups,
					display: next.display,
					stripe_product_id: next.stripe_product_id,
					stripe_meter: next.stripe_meter,
				},
			});
		}),
	);

	for (const op of ops) {
		if (op.regenerateDisplay) {
			await workflows.triggerGenerateFeatureDisplay({
				featureId: op.next.id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			await updateFeatureStripeProductName({ ctx, feature: op.next });
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
	phases,
}: {
	ctx: AutumnContext;
	updateCatalogPlan: UpdateCatalogPlan;
	phases: CatalogPhases;
}): Promise<CatalogResult> => {
	// Identity moves first: atomic per plan, so a later failure can never
	// leave references split between old and new ids.
	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.rename_plans",
		run: () => executeRenamePlans({ ctx, updateCatalogPlan }),
	});
	rewritePublicPlanIdsAfterRename({ updateCatalogPlan });
	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.insert_features",
		run: () => executeInsertFeatures({ ctx, updateCatalogPlan }),
	});
	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.update_features",
		run: () => executeUpdateFeatures({ ctx, updateCatalogPlan }),
	});
	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.remove_features",
		run: () => executeRemoveFeatures({ ctx, updateCatalogPlan }),
	});
	const plans = await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.upsert_products",
		run: () => executeUpsertProducts({ ctx, updateCatalogPlan }),
	});
	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.remove_plans",
		run: () => executeRemovePlans({ ctx, updateCatalogPlan }),
	});
	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.revenuecat_mappings",
		run: () => executeRevenueCatMappings({ ctx, updateCatalogPlan }),
	});
	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.init_stripe",
		run: () => initStripeResourcesForCatalog({ ctx, updateCatalogPlan }),
	});
	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.queue_reward_migrations",
		run: () => queueRewardMigrations({ ctx, updateCatalogPlan }),
	});
	const migrations = await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.migration_drafts",
		run: () => executeMigrationDrafts({ ctx, updateCatalogPlan }),
	});

	await timeCatalogPhase({
		ctx,
		phases,
		phase: "execute.clear_org_cache",
		run: () =>
			clearOrgCache({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				logger: ctx.logger,
			}),
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
		plans: [
			...plans,
			...updateCatalogPlan.removePlans.map((removePlan) => ({
				id: removePlan.planId,
				action: "delete" as const,
			})),
		],
		migrations,
	};
};
