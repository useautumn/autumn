import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "cli-testing-library";
import { CLI_PATH, spawnOpts } from "./setup";

const QUOTED_CLI_PATH = `"${CLI_PATH}"`;

describe("env command", () => {
	afterEach(async () => {
		await cleanup();
	});

	test("shows organization info and environment", async () => {
		const instance = await render("node", [QUOTED_CLI_PATH, "env"], {
			spawnOpts,
		});

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

		expect(stdout).toMatch(/Organization:/i);

		expect(stdout).toMatch(/Slug:/i);

		expect(stdout).toMatch(/Environment:/i);
		expect(stdout).toMatch(/Sandbox|Production/i);
	});
});
