import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	createIsCustomDerivationCache,
	rederiveIsCustomForCustomers,
} from "@/internal/customers/cusProducts/actions/deriveIsCustom/rederiveIsCustomForCustomers.js";
import { migrationItemRunRepo } from "@/internal/migrations/v2/repos/migrationItemRun/index.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { invalidateBatchMigrationCaches } from "./invalidateBatchMigrationCaches.js";

/** Customers per derivation statement. */
const PAGE_SIZE = 5000;
/** Statements in flight; the run's pages are done, so nothing else competes. */
const CONCURRENCY = 4;

const planInternalProductIds = ({
	plan,
}: {
	plan: BatchMigrationExecutionPlan;
}) => [
	...new Set(
		plan.patches.flatMap((patch) => [
			patch.fromProduct.internal_id,
			...(patch.toProduct ? [patch.toProduct.internal_id] : []),
		]),
	),
];

const pagesOfConvergedCustomers = async function* ({
	ctx,
	migrationInternalId,
	migrationRunId,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
}): AsyncGenerator<string[]> {
	let afterItemId: string | null = null;
	for (;;) {
		const page: string[] = await migrationItemRunRepo.listConvergedCustomerIds({
			ctx,
			migrationInternalId,
			migrationRunId,
			afterItemId,
			limit: PAGE_SIZE,
		});
		if (page.length === 0) return;
		yield page;
		afterItemId = page[page.length - 1];
		if (page.length < PAGE_SIZE) return;
	}
};

/** Batch ops bypass the billing-plan hook, so the run's changed and converged customers are
 * re-derived after its pages, out of their way in Postgres. Failures log: the next write self-corrects. */
export const rederiveMigrationRunIsCustom = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
}) => {
	const startedAt = Date.now();
	const cache = createIsCustomDerivationCache();
	const internalProductIds = planInternalProductIds({ plan });
	let derivedCustomers = 0;
	let changed = 0;

	const rederivePage = async (internalCustomerIds: string[]) => {
		const result = await rederiveIsCustomForCustomers({
			ctx,
			internalCustomerIds,
			internalProductIds,
			cache,
		});
		derivedCustomers += internalCustomerIds.length;
		changed += result.changed;
		if (result.changedCustomers.length === 0) return;
		await invalidateBatchMigrationCaches({
			ctx,
			pageResult: {
				succeeded: result.changedCustomers.map(({ internalId, id }) => ({
					internalId,
					id,
					name: null,
					email: null,
				})),
				skipped: [],
				insertedItems: [],
				removedItems: [],
			},
		});
	};

	try {
		const inFlight = new Set<Promise<void>>();
		for await (const page of pagesOfConvergedCustomers({
			ctx,
			migrationInternalId,
			migrationRunId,
		})) {
			const running: Promise<void> = rederivePage(page).finally(() =>
				inFlight.delete(running),
			);
			inFlight.add(running);
			if (inFlight.size >= CONCURRENCY) await Promise.race(inFlight);
		}
		await Promise.all(inFlight);
		ctx.logger.info("batch-migration: re-derived is_custom", {
			data: {
				migrationRunId,
				customers: derivedCustomers,
				changed,
				ms: Date.now() - startedAt,
			},
		});
	} catch (error) {
		ctx.logger.error("batch-migration: is_custom re-derivation failed", {
			error,
			data: { migrationRunId, customers: derivedCustomers },
		});
	}
};
