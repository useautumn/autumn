import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildPublishAlert } from "./publishAlert";

const RUN_URL = "https://github.com/useautumn/autumn/actions/runs/1";
const ok = { result: "success", outputs: {} };

describe("buildPublishAlert", () => {
	test("nothing to say when every job passed and every change was known", () => {
		expect(
			buildPublishAlert({
				needs: { prepare: ok, publish: ok, commit: ok },
				unknownFiles: "",
				runUrl: RUN_URL,
			}),
		).toBeNull();
	});

	test("skipped jobs aren't failures", () => {
		expect(
			buildPublishAlert({
				needs: {
					prepare: ok,
					publish: { result: "skipped" },
					commit: { result: "skipped" },
				},
				unknownFiles: "",
				runUrl: RUN_URL,
			}),
		).toBeNull();
	});

	test("names failed and cancelled jobs, with the run link", () => {
		expect(
			buildPublishAlert({
				needs: {
					prepare: ok,
					publish: { result: "failure" },
					commit: { result: "cancelled" },
				},
				unknownFiles: "",
				runUrl: RUN_URL,
			}),
		).toEqual({
			runUrl: RUN_URL,
			failedJobs: ["publish", "commit"],
			unknownFiles: [],
		});
	});

	test("the guard's unknown files are named on the failed prepare job", () => {
		expect(
			buildPublishAlert({
				needs: {
					prepare: { result: "failure" },
					publish: { result: "skipped" },
					commit: { result: "skipped" },
				},
				unknownFiles: "apps/website/public/SKILL.md,server/x.ts",
				runUrl: RUN_URL,
			}),
		).toEqual({
			runUrl: RUN_URL,
			failedJobs: [
				"prepare (regenerated files not in .github/generated-paths.txt: apps/website/public/SKILL.md, server/x.ts)",
			],
			unknownFiles: [],
		});
	});

	test("a long file list is cut to fit infra's 300-character entry limit", () => {
		const files = Array.from(
			{ length: 40 },
			(_, i) => `apps/some/long/path/file${i}.md`,
		);
		const alert = buildPublishAlert({
			needs: { prepare: { result: "failure" } },
			unknownFiles: files.join(","),
			runUrl: RUN_URL,
		});
		expect(alert?.failedJobs[0]?.length).toBeLessThanOrEqual(300);
		expect(alert?.failedJobs[0]).toEndWith("…)");
	});

	test("unknown files alone never alert: the guard always fails prepare", () => {
		expect(
			buildPublishAlert({
				needs: { prepare: ok, publish: ok, commit: ok },
				unknownFiles: "server/x.ts",
				runUrl: RUN_URL,
			}),
		).toBeNull();
	});

	test("the CLI prints the payload, or nothing, and never fails", () => {
		const cli = (env: Record<string, string>) =>
			Bun.spawnSync(["bun", join(import.meta.dir, "publishAlert.ts")], {
				env: { ...process.env, RUN_URL, ...env },
			});
		const quiet = cli({
			NEEDS: JSON.stringify({ prepare: ok }),
			UNKNOWN_FILES: "",
		});
		expect(quiet.exitCode).toBe(0);
		expect(quiet.stdout.toString()).toBe("");

		const loud = cli({
			NEEDS: JSON.stringify({ prepare: { result: "failure" } }),
			UNKNOWN_FILES: "",
		});
		expect(loud.exitCode).toBe(0);
		expect(JSON.parse(loud.stdout.toString())).toEqual({
			runUrl: RUN_URL,
			failedJobs: ["prepare"],
			unknownFiles: [],
		});

		const broken = cli({ NEEDS: "not json", UNKNOWN_FILES: "" });
		expect(broken.exitCode).toBe(0);
	});
});
