import { expect, test } from "bun:test";
import { customerEntitlements, migrationItemRuns } from "@autumn/shared";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";

const SEAT_MESSAGES = 100;
const SEAT_WORDS = 50;
const NEW_WORDS = 30;

test(`${chalk.yellowBright("plans.update: a license plan drafts no migration for its own seat assignments")}`, async () => {
	const customerId = "lic-seat-draft-customer";
	const idPrefix = "lic-seat-draft";

	const scenario = await setupLicenseUpdateScenario({
		customerId,
		idPrefix,
		seatItems: [
			items.monthlyMessages({ includedUsage: SEAT_MESSAGES }),
			items.monthlyWords({ includedUsage: SEAT_WORDS }),
		],
		includedSeats: 1,
		attachedSeats: 3,
	});
	await scenario.assignSeats({ count: 2 });

	const { ctx, autumnV2_3, parent, devSeat } = scenario;
	const { assignments } = await getLicenseDbState({ db: ctx.db, customerId });
	const liveAssignments = assignments.filter(
		(assignment) => assignment.internal_entity_id,
	);
	expect(liveAssignments).toHaveLength(2);

	const response = await autumnV2_3.post("/plans.update", {
		plan_id: devSeat.id,
		items: [itemsV2.monthlyWords({ included: NEW_WORDS })],
		disable_version: true,
		update_license_parents: [{ plan_id: parent.id, version: 1 }],
		migration: { draft: true },
	});

	const drafts = response.migrations ?? [];
	const planIdsOf = (filter: unknown): string[] => {
		const matcher = (filter as { plan_id?: unknown })?.plan_id;
		if (typeof matcher === "string") return [matcher];
		return (matcher as { $in?: string[] })?.$in ?? [];
	};

	const targeted: string[] = [];
	for (const entry of drafts as { id: string }[]) {
		const [row] = await migrationRepo.get({ ctx, id: entry.id });
		for (const op of row?.operations?.customer ?? []) {
			if (op.type !== "update_plan") continue;
			targeted.push(...planIdsOf(op.plan_filter));
		}
	}
	expect(targeted).not.toContain(devSeat.id);
	expect(targeted).toContain(parent.id);

	for (const entry of drafts as { id: string }[]) {
		const [row] = await migrationRepo.get({ ctx, id: entry.id });
		if (!row) continue;
		await runMigrationInChunks({
			ctx,
			migration: row,
			migrationRunId: generateId("mrun"),
			dryRun: false,
		});

		const runs = await ctx.db
			.select({ status: migrationItemRuns.status })
			.from(migrationItemRuns)
			.where(eq(migrationItemRuns.migration_internal_id, row.internal_id));
		expect(runs.every((run) => run.status !== "skipped")).toBe(true);
	}

	const rows = await ctx.db
		.select({
			featureId: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
		})
		.from(customerEntitlements)
		.where(
			inArray(
				customerEntitlements.customer_product_id,
				liveAssignments.map((assignment) => assignment.id),
			),
		);

	expect(
		rows.filter((row) => row.featureId === TestFeature.Messages),
	).toHaveLength(0);
	expect(
		rows.filter((row) => row.featureId === TestFeature.Words),
	).toHaveLength(2);
});
