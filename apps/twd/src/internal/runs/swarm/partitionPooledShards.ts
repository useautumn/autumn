import { resolve } from "node:path";
import { splitStripeConnectShard } from "@tw/helpers/stripeConnectShard.ts";
import {
	maxWorkersFor,
	partitionByCapability,
} from "@tw/helpers/testCapabilities.ts";
import { splitRepetitionId } from "../repeat/repetitions.ts";
import {
	MAIN_SHARD,
	type SizingShard,
	shardKeyOf,
} from "../sizing/types/sizingShard.ts";

/** Test ids grouped the way the swarm child shards them; the stripe-connect shard brings its own account, so it's left out. */
export const partitionPooledShards = async ({
	testIds,
	testsDirAtSha,
}: {
	testIds: string[];
	testsDirAtSha: string;
}): Promise<SizingShard[]> => {
	const toPath = (testId: string) =>
		resolve(testsDirAtSha, splitRepetitionId({ id: testId }).file);
	const idsByPath = new Map<string, string[]>();
	for (const testId of testIds)
		idsByPath.set(toPath(testId), [
			...(idsByPath.get(toPath(testId)) ?? []),
			testId,
		]);
	const { normalFiles, capabilityShards } = await partitionByCapability([
		...idsByPath.keys(),
	]);
	const { pooledShards } = splitStripeConnectShard(capabilityShards);
	const idsOf = (paths: string[]) =>
		paths.flatMap((path) => idsByPath.get(path) ?? []);
	return [
		{ key: MAIN_SHARD, files: idsOf(normalFiles) },
		...pooledShards.map(({ capabilities, files }) => ({
			key: shardKeyOf(capabilities),
			files: idsOf(files),
			maxWorkers: maxWorkersFor(capabilities),
		})),
	].filter((shard) => shard.files.length > 0);
};
