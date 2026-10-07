import { stripeBudgetForRun } from "@tw/helpers/stripeBudget.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	ACCOUNTS_PER_KEY_CAP,
	MAX_RUN_WORKERS,
} from "../../accounts/allocator/poolLimits.ts";
import { getCostRates } from "../../costs/actions/getCostRates.ts";
import { estimateFileProfiles } from "../../profiles/actions/estimateFileProfiles.ts";
import { getWorkerClass } from "../../profiles/actions/getWorkerClass.ts";
import { listFileProfiles } from "../../profiles/repos/fileProfiles.ts";
import type { RunRow } from "../repos/runsRepo.ts";
import { partitionPooledShards } from "../swarm/partitionPooledShards.ts";
import { detectSoloFiles } from "./detectSoloFiles.ts";
import { planRunSizing } from "./planRunSizing/planRunSizing.ts";
import {
	CONNECTED_ACCOUNT_MAX_INFLIGHT,
	CONNECTED_ACCOUNT_MAX_RPS,
	STRIPE_SANDBOX_ACCOUNT_RPS,
} from "./planRunSizing/sizingConstants.ts";
import { MAIN_SHARD } from "./types/sizingShard.ts";

/** What one worker may use: its Stripe allowance (unchanged limiter budget) and its sandbox size. */
const workerLimits = ({ usableKeys }: { usableKeys: number }) => {
	const budget =
		usableKeys > 0
			? stripeBudgetForRun({
					workers: usableKeys * ACCOUNTS_PER_KEY_CAP,
					keys: usableKeys,
				})
			: { maxRps: 0, maxInFlight: 0 };
	const { workerCores, workerMemoryGib } = getCostRates();
	return {
		stripeRps: Math.min(
			budget.maxRps,
			CONNECTED_ACCOUNT_MAX_RPS,
			STRIPE_SANDBOX_ACCOUNT_RPS,
		),
		stripeInFlight: Math.min(
			budget.maxInFlight,
			CONNECTED_ACCOUNT_MAX_INFLIGHT,
		),
		cores: workerCores,
		memoryMib: workerMemoryGib * 1024,
	};
};

/** Partitions the run like the swarm will, loads profiles and org-mutation flags, and plans its size. */
export const resolveRunSizing = async ({
	ctx,
	run,
	testIds,
	testsDirAtSha,
	usableKeys,
}: {
	ctx: TwdContext;
	run: Pick<RunRow, "maxWorkers" | "maxFilesPerWorker" | "repeat">;
	testIds: string[];
	testsDirAtSha: string;
	usableKeys: number;
}) => {
	const shards = await partitionPooledShards({ testIds, testsDirAtSha });
	const mainFiles = shards.find((s) => s.key === MAIN_SHARD)?.files ?? [];
	const [profiles, staticSolo] = await Promise.all([
		listFileProfiles({ db: ctx.db, workerClass: getWorkerClass() }).catch(
			(error: unknown) => {
				ctx.logger.warn("loading file profiles failed; sizing without them", {
					error: String(error),
				});
				return [];
			},
		),
		detectSoloFiles({ testIds: mainFiles, testsDirAtSha }),
	]);
	const plan = planRunSizing({
		maxWorkers: run.maxWorkers,
		maxFilesPerWorker: run.maxFilesPerWorker,
		repeat: run.repeat,
		shards,
		estimates: estimateFileProfiles({ files: testIds, profiles }),
		staticSolo,
		workerCap: Math.min(usableKeys * ACCOUNTS_PER_KEY_CAP, MAX_RUN_WORKERS),
		limits: workerLimits({ usableKeys }),
	});
	return {
		...plan,
		pooledFiles: shards.reduce((sum, shard) => sum + shard.files.length, 0),
	};
};
