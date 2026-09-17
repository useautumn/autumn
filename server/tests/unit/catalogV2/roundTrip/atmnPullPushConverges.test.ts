import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Feature, FullProduct } from "@autumn/shared";
import { runPull } from "../../../../../packages/atmn/src/actions/pull";
import { runPush } from "../../../../../packages/atmn/src/actions/push";
import { previewIsEmpty } from "../../../../../packages/atmn/src/render/renderPreview";
import { featureCases, planCaseGroups } from "./catalogRoundTripCases";
import { inMemoryCatalogClient } from "./inMemoryCatalogClient";

/**
 * The CLI end of the invariant, over real files: `pull --overwrite` writes
 * the catalog, a second `pull` finds nothing, `push` previews nothing. The
 * same cases as the model suite, now through the emitter, the config loader,
 * and the fixture files pull writes beside the config.
 */

// The package's own import surface; absolute so the scaffolded config resolves
// it regardless of how deep the workspace sits.
const ATMN = join(
	import.meta.dir,
	"../../../../../packages/atmn/src/index",
);
const imports = { atmn: ATMN, builders: ATMN };

const workspace = ({ name }: { name: string }): string => {
	const dir = join(import.meta.dir, ".tmp", name.replace(/[^\w]+/g, "-"));
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	return dir;
};

/** Every file under the workspace, by relative path, so byte-identity is total. */
const snapshot = (dir: string): Record<string, string> => {
	const out: Record<string, string> = {};
	const walk = (sub: string) => {
		for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
			const rel = join(sub, entry.name);
			if (entry.isDirectory()) walk(rel);
			else out[rel] = readFileSync(join(dir, rel), "utf8");
		}
	};
	walk("");
	return out;
};

const expectConverges = async ({
	name,
	catalog,
	multiCurrency,
}: {
	name: string;
	catalog: { features: Feature[]; plans: FullProduct[] };
	multiCurrency?: boolean;
}) => {
	const client = inMemoryCatalogClient({ catalog, multiCurrency });
	const dir = workspace({ name });
	const quiet = () => {};

	const first = await runPull({
		client,
		cwd: dir,
		configPath: dir,
		imports,
		overwrite: true,
		yes: true,
		write: quiet,
	});
	expect(first.appended.sort()).toEqual(
		[
			...catalog.features.map((f) => f.id),
			...catalog.plans.map((p) => `${p.id}@${p.version_slug ?? "v1"}`),
		].sort(),
	);
	const written = snapshot(dir);

	const second = await runPull({ client, cwd: dir, imports, write: quiet });
	expect({
		appended: second.appended,
		replaced: second.replaced,
		deleted: second.deleted,
	}).toEqual({ appended: [], replaced: [], deleted: [] });
	expect(snapshot(dir)).toEqual(written);

	const pushed = await runPush({
		client,
		cwd: dir,
		dryRun: true,
		write: quiet,
	});
	expect(previewIsEmpty({ preview: pushed.preview })).toBe(true);
};

describe("atmn pull → pull → push converges: features", () => {
	for (const { name, feature } of featureCases) {
		test(name, () =>
			expectConverges({ name, catalog: { features: [feature], plans: [] } }),
		);
	}
});

for (const group of planCaseGroups) {
	describe(`atmn pull → pull → push converges: ${group.name}`, () => {
		for (const { name, product, features, org } of group.cases) {
			test(name, () =>
				expectConverges({
					name,
					catalog: { features, plans: [product] },
					multiCurrency: org?.multiCurrency,
				}),
			);
		}
	});
}
