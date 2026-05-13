import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationItemTrackingResult } from "../actions/migrationItem/withMigrationItemTracking.js";
import type { RunScopeItem, RunScopeKind } from "../run/types/runScope.js";
import type { MigrationBatchFn, MigrationRunControls } from "./types.js";

export const runCloudScopeIteration = async ({
	batch,
	iterate,
	kind,
	controls,
	perItem,
}: {
	batch: MigrationBatchFn;
	iterate: () => AsyncGenerator<RunScopeItem[]>;
	kind: RunScopeKind;
	controls?: MigrationRunControls;
	perItem: (args: {
		item: RunScopeItem;
		itemCtx: AutumnContext;
	}) => Promise<MigrationItemTrackingResult | undefined>;
}): Promise<void> => {
	await batch({
		id: `run-${kind}-migration`,
		source: scopeItems({ iterate }),
		concurrency: controls?.concurrency,
		limit: controls?.limit,
		only: null,
		itemKey,
		checkpoint: false,
		onError: "continue",
		fn: async ({ item, ctx: itemCtx }) => {
			if (item.kind !== "customer")
				throw new Error(
					`runMigration: per-item handler missing for kind "${item.kind}"`,
				);
			const result = await perItem({ item, itemCtx });
			if (result) {
				itemCtx.logger.set({
					migrationResult: {
						status: result.status,
						response: result.response,
					},
				});
			}
			return result;
		},
	});
};

const itemKey = (item: RunScopeItem) => item.id ?? item.internal_id;

async function* scopeItems({
	iterate,
}: {
	iterate: () => AsyncGenerator<RunScopeItem[]>;
}): AsyncGenerator<RunScopeItem> {
	for await (const batch of iterate()) {
		for (const item of batch) yield item;
	}
}
