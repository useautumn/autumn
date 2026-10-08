/**
 * Rebuilds the root bun patch for @confluentinc/kafka-javascript from the two provenance patches here:
 * upstream PR #471 (NAN → N-API), then ours (libuv → std/N-API so Bun can load it).
 */
import { join } from "node:path";
import { $ } from "bun";
import {
	CONFLUENT_PACKAGE,
	CONFLUENT_VERSION,
} from "../src/native/nativePackage.js";

const repoRoot = join(import.meta.dir, "../../..");
const patches = join(import.meta.dir, "../patches");
const target = join(repoRoot, "node_modules", CONFLUENT_PACKAGE);

await $`bun patch ${CONFLUENT_PACKAGE}@${CONFLUENT_VERSION}`.cwd(repoRoot);
for (const patch of ["pr471.patch", "bunUvToNapi.patch"]) {
	await $`patch -p1 --forward --silent -i ${join(patches, patch)}`.cwd(target);
}
await $`bun patch --commit ${target}`.cwd(repoRoot);
