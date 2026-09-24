/**
 * The global target flags are documented as working before or after the
 * command. The resolver tests call `resolveTarget` directly and would keep
 * passing through a Commander misconfiguration, so these parse for real.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	isolateTargetEnv,
	targetFor as parseTarget,
} from "./helpers/targetFor";

const env = isolateTargetEnv();
beforeEach(env.clear);
afterEach(env.restore);

const targetFor = ({ argv }: { argv: string[] }) =>
	parseTarget({ command: "push", argv });

test("--local reaches push from either side of the command", async () => {
	const before = await targetFor({ argv: ["--local", "push"] });
	const after = await targetFor({ argv: ["push", "--local"] });

	expect(before.baseUrl).toBe("http://localhost:8080");
	expect(after).toEqual(before);
});

test("--port reaches push from either side of the command", async () => {
	const before = await targetFor({ argv: ["--port", "3001", "push"] });
	const after = await targetFor({ argv: ["push", "--port", "3001"] });

	expect(before.baseUrl).toBe("http://localhost:3001");
	expect(after).toEqual(before);
});

test("--prod reaches push from either side of the command", async () => {
	const before = await targetFor({ argv: ["--prod", "push"] });
	const after = await targetFor({ argv: ["push", "--prod"] });

	expect(before.secretKeyName).toBe("AUTUMN_PROD_SECRET_KEY");
	expect(after).toEqual(before);
});

test("--sandbox selects that sandbox's own key, not the org's", async () => {
	// The flag is not dropped on the way through: it picks the key variable
	// `atmn sandbox create` wrote for that sandbox.
	const before = await targetFor({ argv: ["--sandbox", "sb_1", "push"] });
	const after = await targetFor({ argv: ["push", "--sandbox", "sb_1"] });

	expect(before.secretKeyName).toBe("AUTUMN_SANDBOX_SB_1_SECRET_KEY");
	expect(before.sandboxId).toBe("sb_1");
	expect(after).toEqual(before);
});

test("the short forms travel the same way", async () => {
	expect(await targetFor({ argv: ["-l", "push"] })).toEqual(
		await targetFor({ argv: ["push", "-l"] }),
	);
	expect(
		(await targetFor({ argv: ["-b", "https://example.com", "push"] })).baseUrl,
	).toBe("https://example.com");
});
