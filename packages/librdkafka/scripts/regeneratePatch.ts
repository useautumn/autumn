/**
 * Rebuilds the root bun patch for @confluentinc/kafka-javascript from the provenance patches here:
 * upstream PR #471 (NAN → N-API), then ours: libuv → std/N-API so Bun can load it, librdkafka broker wakeups, consume errors kept past a batch, and pool-thread calls locked against a disconnect.
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
for (const patch of [
	"pr471.patch",
	"bunUvToNapi.patch",
	"brokerWakeup.patch",
	"consumeErrorAfterRecords.patch",
	"fatalErrorCause.patch",
	"lockPoolThreadCalls.patch",
	"adminEventInit.patch",
	"leaderQueryOnMainThread.patch",
]) {
	await $`patch -p1 --forward --silent -i ${join(patches, patch)}`.cwd(target);
}
await $`bun patch --commit ${target}`.cwd(repoRoot);
