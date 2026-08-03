/**
 * Times batchInvalidateCachedFullSubjects for one page's worth (5k) of bench
 * customers — the finalize step's cache-bust cost. Uncached keys take the
 * all-features fallback (max unlink commands), so this is worst-case-ish.
 *
 *   bun tests/perf/batch-migrations/probes/probeFinalizeCacheBench.ts
 */

import { orgToFeaturesByOrgEnv } from "@autumn/shared";
import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import { getBenchContext } from "../utils/benchContext.js";

const PAGE_SIZE = 5000;

const main = async () => {
	const bench = await getBenchContext();
	const { ctx, org } = bench;

	const featuresByOrgEnv = orgToFeaturesByOrgEnv({
		org,
		env: ctx.env,
		features: ctx.features,
	});

	for (let run = 1; run <= 3; run++) {
		const customers = Array.from({ length: PAGE_SIZE }, (_, index) => ({
			customerId: `bench-c-${3_200_001 + (run - 1) * PAGE_SIZE + index}`,
			orgId: org.id,
			env: ctx.env,
		}));
		const started = Date.now();
		await batchInvalidateCachedFullSubjects({
			customers,
			featuresByOrgEnv,
			getRedisTargetsForCustomer: () => getRedisTargetsForCustomer({ org }),
		});
		const ms = Date.now() - started;
		console.log(
			`run ${run}: invalidated ${PAGE_SIZE.toLocaleString()} customers in ${ms}ms (${((ms / PAGE_SIZE) * 1000).toFixed(0)}µs/customer)`,
		);
	}
	process.exit(0);
};

await main();
