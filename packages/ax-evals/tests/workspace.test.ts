import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { inspectWorkspaceConfig } from "../src/grading/inspectConfig.ts";
import { createCaseWorkspace } from "../src/workspace/createCaseWorkspace.ts";
import { ATMN_DIR } from "../src/workspace/workspacePaths.ts";

const run = promisify(execFile);

test("eval workspaces run and grade the promoted atmn package", async () => {
	const workspace = await createCaseWorkspace("promoted-package", {
		secretKey: "am_sk_test_workspace",
		backendUrl: "http://localhost:8080",
	});
	try {
		expect(await realpath(join(workspace.dir, "node_modules/atmn"))).toBe(
			await realpath(ATMN_DIR),
		);
		const manifest = JSON.parse(
			await readFile(join(ATMN_DIR, "package.json"), "utf8"),
		);
		expect(manifest.name).toBe("atmn");
		const { stdout } = await run(
			join(workspace.dir, "node_modules/.bin/atmn"),
			["--version"],
			{ cwd: workspace.dir },
		);
		expect(stdout.trim()).toBe("atmn v0.0.0-dev");
		await writeFile(
			join(workspace.dir, "autumn.config.ts"),
			`import { atmn, feature } from "atmn";
export default atmn({ features: [feature({ featureId: "messages", name: "Messages", type: "metered", consumable: true })], plans: [] });
`,
		);
		const inspected = await inspectWorkspaceConfig(workspace.dir);
		expect(inspected.parseError).toBeUndefined();
		expect(inspected.configFound).toBe(true);
		expect(inspected.features).toEqual([{ id: "messages", type: "metered" }]);
	} finally {
		await workspace.cleanup();
	}
});
