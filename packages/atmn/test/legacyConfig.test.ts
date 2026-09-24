/**
 * A config written for atmn 1.x (the `item` builder, no root `atmn()` export)
 * is refused before it is imported, with the two-step way forward, instead of
 * dying inside the import with "Export named 'item' not found".
 */

import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isLegacyConfigText,
	LegacyConfigError,
} from "../src/config/legacyConfig";
import { loadConfig } from "../src/config/loadConfig";

const ONE_X_CONFIG = readFileSync(
	join(import.meta.dir, "../../atmn-tests/autumn.config.ts"),
	"utf8",
);

const TWO_X_CONFIG = `import { atmn, feature, plan } from "atmn";

export const messages = feature({ featureId: "messages", name: "Messages", type: "metered", consumable: true });
export const pro = plan({ planId: "pro", versionSlug: "v1", active: true, name: "Pro", items: [{ featureId: "messages", included: 10 }] });

export default atmn({ features: [messages], plans: [pro] });
`;

test("a 1.x config is recognised by its item import", () => {
	expect(isLegacyConfigText({ text: ONE_X_CONFIG })).toBe(true);
});

test("a config with no root export is recognised too", () => {
	expect(
		isLegacyConfigText({
			text: `import { feature, plan } from "atmn";\nexport const pro = plan({ planId: "pro" });\n`,
		}),
	).toBe(true);
});

test("a 2.x config passes", () => {
	expect(isLegacyConfigText({ text: TWO_X_CONFIG })).toBe(false);
});

test("loadConfig refuses a 1.x config with the migration steps", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-legacy-"));
	try {
		writeFileSync(join(dir, "autumn.config.ts"), ONE_X_CONFIG);
		const error = await loadConfig({ dirs: [dir] }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(LegacyConfigError);
		expect((error as Error).message).toBe(
			[
				"autumn.config.ts was written for atmn 1.x. atmn 2 uses a new config format.",
				"",
				"  1. Take note of any pending changes you have made to your config",
				"  2. Rebuild the existing config from your org:  atmn pull --overwrite --yes",
				"  3. Re-apply any changes you made before upgrading to v2 in the new format and push when ready",
			].join("\n"),
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
