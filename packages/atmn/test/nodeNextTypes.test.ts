import { expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("NodeNext consumers resolve the public exports and retain type checking", () => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-nodenext-"));
	const packageDir = join(import.meta.dir, "..");
	try {
		mkdirSync(join(dir, "node_modules"));
		symlinkSync(packageDir, join(dir, "node_modules/atmn"));
		writeFileSync(join(dir, "package.json"), '{"type":"module"}');
		writeFileSync(
			join(dir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					module: "NodeNext",
					moduleResolution: "NodeNext",
					target: "ES2022",
					strict: true,
					noEmit: true,
					types: [],
				},
				files: ["consumer.ts"],
			}),
		);
		const source = `import { atmn, feature, plan, type AtmnConfig } from "atmn";
const messages = feature({ featureId: "messages", name: "Messages", type: "metered", consumable: true });
const pro = plan({ planId: "pro", versionSlug: "v1", active: true, name: "Pro" });
const config: AtmnConfig = { features: [messages], plans: [pro] };
export default atmn(config);
`;
		writeFileSync(join(dir, "consumer.ts"), source);
		const command = ["bunx", "--no-install", "tsgo", "-p", dir];
		const valid = Bun.spawnSync(command, { cwd: packageDir });
		expect(valid.stdout.toString() + valid.stderr.toString()).toBe("");
		expect(valid.exitCode).toBe(0);
		writeFileSync(
			join(dir, "consumer.ts"),
			source.replace('type: "metered"', 'type: "invalid-feature-type"'),
		);
		const invalid = Bun.spawnSync(command, { cwd: packageDir });
		expect(invalid.exitCode).not.toBe(0);
		expect(invalid.stdout.toString()).toContain("TS2322");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
