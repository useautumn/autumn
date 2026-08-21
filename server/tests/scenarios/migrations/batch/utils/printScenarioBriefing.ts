import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import chalk from "chalk";
import type { CastDivergence, SeededCast } from "./seedMigrationCast";
import type { CustomerStateSnapshot } from "./snapshotMigrationState";

export type ScenarioMigration = {
	id: string;
	filter: MigrationFilter;
	operations: Operations;
	no_billing_changes: boolean;
};

export type ScenarioExpectation = {
	lane: "batch" | "per_customer";
	rejections?: string[];
	notes: string[];
};

const heading = (label: string) =>
	console.log(
		`\n${chalk.cyanBright(`── ${label} ${"─".repeat(Math.max(0, 58 - label.length))}`)}`,
	);

const describeDivergence = (divergence: CastDivergence | undefined) => {
	if (!divergence) return "plain catalog holder";
	if (divergence.kind === "custom_attach") return "custom attach (is_custom)";
	if (divergence.kind === "custom_patch") {
		return "customized by subscriptions.update patch (is_custom)";
	}
	if (divergence.kind === "custom_definition") {
		return divergence.allowance === undefined
			? `custom definition of ${divergence.featureId}, same meaning`
			: `custom definition of ${divergence.featureId}, allowance ${divergence.allowance}`;
	}
	if (divergence.kind === "paid_row") {
		return `paid price hung off ${divergence.featureId}`;
	}
	return `${divergence.balance} accrued rollover on ${divergence.featureId}`;
};

const formatFeatureRow = (
	row: CustomerStateSnapshot["featureRows"][number],
) => {
	const cadence = row.unlimited
		? "unlimited"
		: `${row.balance ?? 0}/${row.allowance ?? 0} ${row.interval ?? "lifetime"}${
				row.intervalCount && row.intervalCount > 1
					? `x${row.intervalCount}`
					: ""
			}`;
	const flags = [
		row.isAssignment ? "seat" : null,
		row.isCustomDefinition ? "custom-def" : null,
		row.priced ? "paid" : null,
		row.pooled ? "pooled" : null,
		row.entityFeatureId ? `entity:${row.entityFeatureId}` : null,
		row.rolloverBalance ? `rollover ${row.rolloverBalance}` : null,
	].filter(Boolean);

	return `    ${(row.featureId ?? "?").padEnd(12)} ${cadence.padEnd(22)} ${
		flags.length ? chalk.yellow(`[${flags.join("] [")}]`) : ""
	}`;
};

const printCustomerState = ({
	member,
	snapshot,
}: {
	member: SeededCast["members"][number];
	snapshot: CustomerStateSnapshot;
}) => {
	console.log(
		`\n  ${chalk.bold(member.customerId)}  ${chalk.dim(describeDivergence(member.divergence))}`,
	);
	if (member.note) console.log(`    ${chalk.dim(`↳ ${member.note}`)}`);

	if (snapshot.planRows.length === 0) {
		console.log(chalk.dim("    (no plans)"));
	}
	for (const row of snapshot.planRows) {
		const flags = [
			row.isCustom ? "is_custom" : null,
			row.licenseLinkId ? "seat assignment" : null,
			row.internalEntityId ? "entity-scoped" : null,
		].filter(Boolean);
		console.log(
			`    ${chalk.green(`${row.planId} v${row.version}`)} ${row.status}${
				flags.length ? chalk.yellow(`  [${flags.join("] [")}]`) : ""
			}`,
		);
	}
	for (const row of snapshot.featureRows) {
		console.log(formatFeatureRow(row));
	}
	for (const pool of snapshot.pools) {
		console.log(
			`    ${chalk.magenta("pool")} granted ${pool.granted} remaining ${pool.remaining} paid ${pool.paidQuantity}  plan_license_id ${pool.planLicenseId}`,
		);
	}
};

/**
 * Prints the seeded cast, its current state, the migrations now sitting ready in
 * the dashboard and what to expect once you run them.
 */
export const printScenarioBriefing = ({
	title,
	cast,
	state,
	migrations,
	draftsCreated,
	expectation,
	scenarioFile,
}: {
	title: string;
	cast: SeededCast;
	state: CustomerStateSnapshot[];
	/** Several ops when the point of the scenario is comparing them. */
	migrations: ScenarioMigration[];
	draftsCreated: boolean;
	expectation: ScenarioExpectation;
	scenarioFile: string;
}) => {
	const dashboard = process.env.AUTUMN_TEST_VITE_URL ?? "http://localhost:3000";
	const migrationUrl = (id: string) =>
		`${dashboard}/sandbox/migrations/${id}?step=live`;

	heading(`SCENARIO — ${title}`);
	console.log(`parent plan      ${cast.parent.id} (v1..v${cast.versionCount})`);
	if (cast.seat) console.log(`license plan     ${cast.seat.id}`);
	if (cast.paidTemplate) {
		console.log(
			`paid template    ${cast.paidTemplate.id} ${chalk.dim("(price donor only)")}`,
		);
	}
	console.log(`customers        ${cast.members.length}`);

	heading("CURRENT STATE (before migrating)");
	for (const [index, snapshot] of state.entries()) {
		printCustomerState({ member: cast.members[index], snapshot });
	}

	heading(
		draftsCreated
			? "MIGRATIONS READY TO RUN"
			: "MIGRATIONS (left as they were)",
	);
	for (const [index, entry] of migrations.entries()) {
		const label =
			migrations.length === 1
				? "run it"
				: `run ${index + 1} of ${migrations.length}`;
		console.log(
			`\n  ${chalk.bold(entry.id)}\n  ${label.padEnd(8)}  ${chalk.blueBright(migrationUrl(entry.id))}`,
		);
	}
	if (process.env.SHOW_OPS === "1") {
		heading("MIGRATION BODIES");
		console.log(JSON.stringify(migrations, null, 2));
	}

	heading("EXPECTED AFTER MIGRATING");
	console.log(
		`lane             ${chalk.bold(expectation.lane)}${
			expectation.rejections?.length
				? chalk.yellow(`  rejections: ${expectation.rejections.join(", ")}`)
				: ""
		}`,
	);
	for (const note of expectation.notes) {
		console.log(`  · ${note}`);
	}

	heading("NEXT");
	console.log(
		`sign in as org   ${dashboard}/impersonate-redirect?org_id=${cast.ctx.org.id}`,
	);
	console.log(
		`a customer       ${dashboard}/sandbox/customers/${cast.members[0].customerId}`,
	);
	console.log(`re-read state    SEED=0 ./run.sh $(pwd)/${scenarioFile}`);
	console.log(`reset scenario   ./run.sh $(pwd)/${scenarioFile}`);
	console.log(
		chalk.dim(`show op bodies   SHOW_OPS=1 ./run.sh $(pwd)/${scenarioFile}`),
	);
};
