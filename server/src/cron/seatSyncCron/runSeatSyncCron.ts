import type { AppEnv, Organization } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext";
import { executeWithHealthTracking } from "@/db/pgHealthMonitor.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CronContext } from "../utils/CronContext.js";

const PAGE_SIZE = 500;
const MAX_ITERATIONS = 20;
const TIMEOUT_MS = 60_000;
const INVALIDATION_CONCURRENCY = 25;

type MismatchedSeatRow = {
	seat_id: string;
	parent_status: string;
	parent_subscription_ids: string[] | null;
	parent_scheduled_ids: string[] | null;
	customer_id: string | null;
	org_id: string;
	env: AppEnv;
};

/**
 * Seats whose lifecycle drifted from their pool parent, keyset-paged by seat
 * id. Walks idx_customer_products_seat_sync (partial on seats), one indexed
 * probe per seat for pool + parent. Reads ride the replica in production.
 */
const getMismatchedSeatsPage = async ({
	ctx,
	cursor,
	batchSize,
}: {
	ctx: CronContext;
	cursor: string | null;
	batchSize: number;
}): Promise<MismatchedSeatRow[]> => {
	const query = sql`
		SELECT
			cp.id AS seat_id,
			pcp.status AS parent_status,
			pcp.subscription_ids AS parent_subscription_ids,
			pcp.scheduled_ids AS parent_scheduled_ids,
			c.id AS customer_id,
			c.org_id AS org_id,
			c.env AS env
		FROM customer_products cp
		JOIN customer_licenses pcl ON pcl.link_id = cp.customer_license_link_id
		JOIN customer_products pcp ON pcp.id = pcl.parent_customer_product_id
		JOIN customers c ON c.internal_id = cp.internal_customer_id
		WHERE cp.customer_license_link_id IS NOT NULL
			${cursor ? sql`AND cp.id > ${cursor}` : sql``}
			AND (
				cp.status IS DISTINCT FROM pcp.status
				OR cp.subscription_ids IS DISTINCT FROM pcp.subscription_ids
				OR cp.scheduled_ids IS DISTINCT FROM pcp.scheduled_ids
			)
		ORDER BY cp.id
		LIMIT ${batchSize}
	`;
	const { result } = await executeWithHealthTracking({
		db: ctx.db,
		query,
		useReplica: process.env.NODE_ENV === "production",
	});
	return result as unknown as MismatchedSeatRow[];
};

/**
 * One set-based UPDATE converging candidate seats onto their parent. The
 * parent is re-read on MAIN here (the page may come from a lagged replica),
 * and the mismatch predicate re-checks so already-converged rows no-op.
 */
const syncSeats = async ({
	ctx,
	rows,
}: {
	ctx: CronContext;
	rows: MismatchedSeatRow[];
}) => {
	const seatIds = rows.map((row) => row.seat_id);
	await ctx.db.execute(sql`
		UPDATE customer_products cp
		SET
			status = pcp.status,
			subscription_ids = pcp.subscription_ids,
			scheduled_ids = pcp.scheduled_ids,
			updated_at = ${Date.now()}
		FROM customer_licenses pcl
		JOIN customer_products pcp ON pcp.id = pcl.parent_customer_product_id
		WHERE cp.id IN (${sql.join(
			seatIds.map((seatId) => sql`${seatId}`),
			sql`, `,
		)})
			AND pcl.link_id = cp.customer_license_link_id
			AND (
				cp.status IS DISTINCT FROM pcp.status
				OR cp.subscription_ids IS DISTINCT FROM pcp.subscription_ids
				OR cp.scheduled_ids IS DISTINCT FROM pcp.scheduled_ids
			)
	`);
};

/** Drops FullCustomer + fullSubject caches for every affected customer. */
const invalidateAffectedCustomers = async ({
	ctx,
	rows,
}: {
	ctx: CronContext;
	rows: MismatchedSeatRow[];
}) => {
	const byOrgEnv = new Map<string, MismatchedSeatRow[]>();
	for (const row of rows) {
		if (!row.customer_id) continue;
		const key = `${row.org_id}:${row.env}`;
		byOrgEnv.set(key, [...(byOrgEnv.get(key) ?? []), row]);
	}

	for (const orgRows of byOrgEnv.values()) {
		const repoContext: RepoContext = {
			db: ctx.db,
			org: { id: orgRows[0].org_id } as Organization,
			env: orgRows[0].env,
			logger: ctx.logger,
			redisV2: resolveRedisV2(),
		};
		const customerIds = [
			...new Set(orgRows.map((row) => row.customer_id as string)),
		];
		// Bounded fan-out: at most INVALIDATION_CONCURRENCY in flight.
		for (
			let index = 0;
			index < customerIds.length;
			index += INVALIDATION_CONCURRENCY
		) {
			await Promise.all(
				customerIds
					.slice(index, index + INVALIDATION_CONCURRENCY)
					.map((customerId) =>
						deleteCachedFullCustomer({
							ctx: repoContext as unknown as AutumnContext,
							customerId,
							source: "seat-sync-cron",
						}),
					),
			);
		}
	}
};

/**
 * Converges seat (license assignment) lifecycle onto the pool parent's:
 * status, subscription_ids, scheduled_ids. Backstop for parent transitions
 * the write paths miss; read-time inheritance covers the window in between.
 */
export const runSeatSyncCron = async ({ ctx }: { ctx: CronContext }) => {
	const { logger } = ctx;
	const startTime = Date.now();

	try {
		let iteration = 0;
		let totalSynced = 0;
		let cursor: string | null = null;

		while (
			iteration < MAX_ITERATIONS &&
			Date.now() - startTime < TIMEOUT_MS
		) {
			iteration++;

			const page = await getMismatchedSeatsPage({
				ctx,
				cursor,
				batchSize: PAGE_SIZE,
			});
			if (page.length === 0) break;

			await syncSeats({ ctx, rows: page });
			await invalidateAffectedCustomers({ ctx, rows: page });

			totalSynced += page.length;
			cursor = page[page.length - 1].seat_id;

			if (page.length < PAGE_SIZE) break;
		}

		if (totalSynced > 0) {
			logger.info(
				{ jobName: "seat-sync", synced: totalSynced, iterations: iteration },
				`[seat-sync] synced ${totalSynced} seat customer products`,
			);
		}
	} catch (error) {
		logger.error(`[seat-sync] failed: ${error}`);
	}
};
