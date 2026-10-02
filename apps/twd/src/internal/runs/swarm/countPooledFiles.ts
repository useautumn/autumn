import { resolve } from "node:path";
import { splitStripeConnectShard } from "@tw/helpers/stripeConnectShard.ts";
import { partitionByCapability } from "@tw/helpers/testCapabilities.ts";
import { splitRepetitionId } from "../repeat/repetitions.ts";

/** Files that need a pool account; the stripe-connect shard brings its own. */
export const countPooledFiles = async ({
	testIds,
	testsDirAtSha,
}: {
	testIds: string[];
	testsDirAtSha: string;
}): Promise<number> => {
	const { normalFiles, capabilityShards } = await partitionByCapability(
		testIds.map((testId) =>
			resolve(testsDirAtSha, splitRepetitionId({ id: testId }).file),
		),
	);
	const { pooledShards } = splitStripeConnectShard(capabilityShards);
	return (
		normalFiles.length +
		pooledShards.reduce((sum, { files }) => sum + files.length, 0)
	);
};
