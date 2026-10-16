import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	CONFLUENT_PACKAGE,
	CONFLUENT_VERSION,
} from "../../src/native/nativePackage.js";

const packageRoot = join(import.meta.dir, "../..");
const repoRoot = join(packageRoot, "../..");

function touchedFiles(patch: string): string[] {
	return [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map(
		(match) => match[1] as string,
	);
}

describe("the confluent patch", () => {
	test("is pinned to the exact version the root patch applies to", async () => {
		const pkg = await Bun.file(join(packageRoot, "package.json")).json();
		const root = await Bun.file(join(repoRoot, "package.json")).json();
		expect(pkg.dependencies[CONFLUENT_PACKAGE]).toBe(CONFLUENT_VERSION);
		expect(
			root.patchedDependencies[`${CONFLUENT_PACKAGE}@${CONFLUENT_VERSION}`],
		).toBe("patches/@confluentinc%2Fkafka-javascript@1.10.0.patch");
	});

	test("touches nothing beyond upstream #471 and our two patches", async () => {
		const read = (path: string) => Bun.file(path).text();
		const combined = await read(
			join(repoRoot, "patches/@confluentinc%2Fkafka-javascript@1.10.0.patch"),
		);
		const provenance = new Set([
			...touchedFiles(await read(join(packageRoot, "patches/pr471.patch"))),
			...touchedFiles(
				await read(join(packageRoot, "patches/bunUvToNapi.patch")),
			),
			...touchedFiles(
				await read(join(packageRoot, "patches/brokerWakeup.patch")),
			),
		]);
		const touched = touchedFiles(combined);
		expect(touched.length).toBeGreaterThan(0);
		expect(touched.filter((file) => !provenance.has(file))).toEqual([]);
	});

	test("leaves no libuv call Bun cannot serve", async () => {
		const combined = await Bun.file(
			join(repoRoot, "patches/@confluentinc%2Fkafka-javascript@1.10.0.patch"),
		).text();
		const added = combined
			.split("\n")
			.filter((line) => line.startsWith("+") && !line.startsWith("+++"));
		const unsupported = added.filter((line) =>
			/\buv_(rwlock|thread|async|close|default_loop)\w*\(/.test(line),
		);
		expect(unsupported).toEqual([]);
	});
});
