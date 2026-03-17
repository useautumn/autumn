import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "cli-testing-library";
import { CLI_PATH, spawnOpts } from "./setup";

// Quote the CLI_PATH for shell execution (cli-testing-library uses shell: true)
const QUOTED_CLI_PATH = `"${CLI_PATH}"`;

describe("env command", () => {
	afterEach(async () => {
		await cleanup();
	});

	test("shows organization info and environment", async () => {
		const instance = await render("node", [QUOTED_CLI_PATH, "env"], {
			spawnOpts,
		});

		// Wait for process to exit
		await waitFor(
			() => {
				const exit = instance.hasExit();
				expect(exit).toBeTruthy();
				expect(exit?.exitCode).toBe(0);
			},
			{ timeout: 10000 },
		);

		const stdout = instance.stdoutArr
			.map((s) => s.contents.toString())
			.join("");

		// Should show organization name
		expect(stdout).toMatch(/Organization:/i);

		// Should show organization slug
		expect(stdout).toMatch(/Slug:/i);

		// Should show environment (Sandbox or Production)
		expect(stdout).toMatch(/Environment:/i);
		expect(stdout).toMatch(/Sandbox|Production/i);
	});
});
