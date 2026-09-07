import { organizations } from "@autumn/shared";
import { initDrizzle } from "@server/db/initDrizzle.js";
import { logger } from "@server/external/logtail/logtailUtils.js";
import { waitForRedisReady } from "@server/external/redis/initRedis.js";
import { getMiscRedisTargets } from "@server/external/redis/miscCache/resolveMiscRedis.js";
import {
	startAllEdgeConfigPolling,
	stopAllEdgeConfigPolling,
} from "@server/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { clearOrgCache } from "@server/internal/orgs/orgUtils/clearOrgCache.js";
import { sql } from "drizzle-orm";

const { db, client } = initDrizzle();
const apply = process.argv.includes("--apply");
const includePastDue = sql`COALESCE((${organizations.config}->>'include_past_due')::boolean, true)`;
const needsSeed = sql`${organizations.config}->'block_overdue_entitlements'
	IS DISTINCT FROM to_jsonb(NOT ${includePastDue})`;

try {
	if (apply) {
		await startAllEdgeConfigPolling({ logger });
		for (const target of getMiscRedisTargets()) {
			await waitForRedisReady(target.redis, target.instanceName);
		}

		const updated = await db
			.update(organizations)
			.set({
				config: sql`${organizations.config} || jsonb_build_object(
					'include_past_due', ${includePastDue},
					'block_overdue_entitlements', NOT ${includePastDue}
				)`,
			})
			.where(needsSeed)
			.returning({ id: organizations.id });

		for (const org of updated) {
			await clearOrgCache({ db, orgId: org.id });
		}
		console.log(
			`Seeded overdue entitlement settings for ${updated.length} organizations.`,
		);
	} else {
		const [result] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(organizations)
			.where(needsSeed);
		console.log(
			`${result?.count ?? 0} organizations need seeding. Pass --apply to write.`,
		);
	}
} finally {
	stopAllEdgeConfigPolling();
	if (apply) {
		for (const target of getMiscRedisTargets()) target.redis.disconnect();
	}
	await client.end();
}
