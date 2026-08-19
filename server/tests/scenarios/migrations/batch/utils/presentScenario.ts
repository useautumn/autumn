import type {
	ScenarioExpectation,
	ScenarioMigration,
} from "./printScenarioBriefing";
import { printScenarioBriefing } from "./printScenarioBriefing";
import type { SeededCast } from "./seedMigrationCast";
import { snapshotCast } from "./snapshotMigrationState";

/** Creating is delete-then-create, which would throw away the run history a
 * post-run read is trying to inspect — so SEED=0 leaves the drafts alone. */
const createMigrationDrafts = async ({
	cast,
	migrations,
}: {
	cast: SeededCast;
	migrations: ScenarioMigration[];
}) => {
	if (process.env.SEED === "0") return false;

	for (const migration of migrations) {
		await cast.autumnV2_2.migrationsV2.deleteAndCreate(migration);
	}
	return true;
};

/**
 * Puts a seeded scenario in front of you: reads the state back, leaves every
 * migration authored and unstarted in the dashboard, and prints how to drive it.
 */
export const presentScenario = async ({
	title,
	cast,
	migrations,
	expectation,
	scenarioFile,
}: {
	title: string;
	cast: SeededCast;
	migrations: ScenarioMigration[];
	expectation: ScenarioExpectation;
	scenarioFile: string;
}) => {
	const state = await snapshotCast({ cast });
	const draftsCreated = await createMigrationDrafts({ cast, migrations });

	printScenarioBriefing({
		title,
		cast,
		state,
		migrations,
		draftsCreated,
		expectation,
		scenarioFile,
	});
};
