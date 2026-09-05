import { expect } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AutumnClient } from "../../../../packages/atmn-nightly/src/generated/client";
import { uniqueTestId } from "../../integration/catalog-v2/utils/uniqueTestId.js";
import {
	type AtmnScenario,
	runCli,
	TMP_ROOT,
	wireOfConfig,
} from "./initAtmnScenario.js";

type PreviewRow = { action?: string } & Record<string, unknown>;

/** Every preview row is `none`/`skip`: the server itself says config ≡ catalog. */
export const expectPreviewNone = async ({
	client,
	wire,
}: {
	client: AutumnClient;
	wire: Record<string, unknown>;
}): Promise<void> => {
	// biome-ignore lint/suspicious/noExplicitAny: the wire is the CLI's own document
	const preview = (await client.previewUpdate(wire as any)) as Record<
		string,
		unknown
	>;
	const changed: string[] = [];
	for (const [collection, rows] of Object.entries(preview)) {
		if (!Array.isArray(rows)) continue;
		for (const row of rows as PreviewRow[]) {
			if (
				row.action === undefined ||
				row.action === "none" ||
				row.action === "skip"
			)
				continue;
			changed.push(`${collection}:${JSON.stringify(row)}`);
		}
	}
	expect(changed).toEqual([]);
};

const snapshot = (dir: string): Map<string, string> => {
	const out = new Map<string, string>();
	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.name.endsWith(".ts"))
				out.set(path.slice(dir.length + 1), readFileSync(path, "utf8"));
		}
	};
	walk(dir);
	return out;
};

/**
 * The crud contract in one call: push the config; the server's own preview
 * says nothing is left to apply; a pull into an empty dir scaffolds a config
 * the server also finds nothing to apply for; pulling that dir again writes
 * nothing. Returns the fresh dir's files for extra assertions.
 */
export const expectRoundTrip = async ({
	scenario,
	includeMappings = false,
}: {
	scenario: AtmnScenario;
	includeMappings?: boolean;
}): Promise<{
	freshDir: string;
	freshFiles: Map<string, string>;
	freshWire: Record<string, unknown>;
}> => {
	await scenario.push();
	await expectPreviewNone({
		client: scenario.client,
		wire: await scenario.wireFromConfig(),
	});

	const freshDir = join(TMP_ROOT, uniqueTestId("atmn_fresh"));
	mkdirSync(freshDir, { recursive: true });
	try {
		const pullFresh = () =>
			runCli({
				cwd: freshDir,
				args: ["pull", ...(includeMappings ? ["--include-mappings"] : [])],
				secretKey: scenario.secretKey,
				baseUrl: scenario.baseUrl,
			});
		pullFresh();
		const freshWire = wireOfConfig({
			configPath: join(freshDir, "autumn.config.ts"),
		});
		await expectPreviewNone({ client: scenario.client, wire: freshWire });

		const before = snapshot(freshDir);
		pullFresh();
		const after = snapshot(freshDir);
		expect([...after.entries()]).toEqual([...before.entries()]);
		return { freshDir, freshFiles: after, freshWire };
	} catch (error) {
		// What the pull wrote is the evidence; the dir is gone by the time anyone looks.
		const written = [...snapshot(freshDir).entries()]
			.map(([file, text]) => `--- ${file}\n${text}`)
			.join("\n");
		rmSync(freshDir, { recursive: true, force: true });
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`${message}\n\nFresh pull wrote:\n${written}`);
	}
};
