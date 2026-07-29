import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeConfig } from "../../src/commands/pull/writeConfig.js";
import type { Plan } from "../../src/compose/index.js";

const plans: Plan[] = [
	{ id: "seats", name: "Seats", items: [] },
	{
		id: "pro",
		name: "Pro",
		items: [],
		licenses: [{ licensePlanId: "seats", version: 1 }],
	},
];

const declaration = (name: string) =>
	`export const ${name} = plan({ id: '${name}', name: '${name}', items: [] });`;

test.concurrent(
	"licensed plans update in place regardless of declaration order",
	async () => {
		const cwd = mkdtempSync(join(tmpdir(), "atmn-license-order-"));
		const configPath = join(cwd, "autumn.config.ts");
		try {
			writeFileSync(
				configPath,
				`import { plan } from 'atmn';\n\n// keep me\n${declaration("pro")}\n\n${declaration("seats")}\n`,
			);
			expect((await writeConfig([], plans, cwd)).inPlace).toBe(true);
			const config = readFileSync(configPath, "utf8");
			expect(config).toContain("// keep me");
			expect(config).toContain("licensePlanId: 'seats'");
			expect(config.indexOf("export const pro")).toBeLessThan(
				config.indexOf("export const seats"),
			);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	},
);
