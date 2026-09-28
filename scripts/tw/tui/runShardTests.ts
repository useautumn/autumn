import type { TestExecutor } from "../../testScripts/testExecutor";
import { runSwarmTests } from "./runnerCore";

export const runShardTests = async ({
	shards,
}: {
	shards: { files: string[]; executor: TestExecutor; maxParallel: number }[];
}): Promise<void> => {
	const totalFiles = shards.reduce(
		(total, shard) => total + shard.files.length,
		0,
	);
	const results = await Promise.allSettled(
		shards.map(({ files, executor, maxParallel }) =>
			runSwarmTests(files, executor, { maxParallel, totalFiles }),
		),
	);
	for (const result of results) {
		if (result.status === "rejected") throw result.reason;
	}
};
