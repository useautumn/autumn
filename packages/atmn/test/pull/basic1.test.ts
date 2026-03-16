import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { cleanup, render, waitFor } from "cli-testing-library";
import {
	CLI_PATH,
	cleanupTempDir,
	createTempDir,
	existsSync,
	FIXTURES_PATH,
	join,
	readFileSync,
	spawnOpts,
} from "../setup";

const BASIC_CONFIG_PATH = join(FIXTURES_PATH, "basic-config");

// Quote the CLI_PATH for shell execution (cli-testing-library uses shell: true)
const QUOTED_CLI_PATH = `"${CLI_PATH}"`;

describe("pull command", () => {
	let tempDir: string;

	beforeAll(() => {
		tempDir = createTempDir("atmn-pull-test-");
	});

	afterAll(() => {
		cleanupTempDir(tempDir);
	});

	afterEach(async () => {
		await cleanup();
	});

	test("pulls config from server", async () => {
		// First ensure something exists by pushing
		const pushInstance = await render("node", [QUOTED_CLI_PATH, "push", "-y"], {
			cwd: BASIC_CONFIG_PATH,
			spawnOpts,
		});
		await waitFor(
			() => {
				const exit = pushInstance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);
		await cleanup();

		// Now pull into temp directory
		const pullInstance = await render("node", [QUOTED_CLI_PATH, "pull"], {
			cwd: tempDir,
			spawnOpts,
		});

		await waitFor(
			() => {
				const exit = pullInstance.hasExit();
				expect(exit).toBeTruthy();
			},
			{ timeout: 30000 },
		);

		// Verify autumn.config.ts was created
		const configPath = join(tempDir, "autumn.config.ts");
		expect(existsSync(configPath)).toBe(true);

		// Verify config contains our feature and plan
		const configContent = readFileSync(configPath, "utf-8");
		expect(configContent).toContain("messages");
		expect(configContent).toContain("pro");
	});
});
