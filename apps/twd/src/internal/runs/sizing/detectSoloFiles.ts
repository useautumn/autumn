import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pLimit from "p-limit";
import { splitRepetitionId } from "../repeat/repetitions.ts";

/** A test can opt out of sharing a worker with `// tw:solo` anywhere in the file. */
export const SOLO_MARKER = "tw:solo";

/** Calls that change state every file on the worker shares: the one test org, its config, caches and catalog. */
const ORG_WIDE_MUTATIONS: { reason: string; pattern: RegExp }[] = [
	{ reason: "marker", pattern: new RegExp(SOLO_MARKER) },
	{
		reason: "org config",
		pattern: /OrgService\.update|setOrgCurrency|["'`]\/organization\b/,
	},
	{ reason: "org cache", pattern: /clearOrgCache/ },
	{
		reason: "edge config / rate limits",
		pattern:
			/updateServerEdgeConfig|updateServerRateLimitOverrides|setServerRateLimitOverride/,
	},
	{
		reason: "rollout flags",
		pattern: /setOrgRolloutPercent|cleanupOrgRollout|setCustomerRolloutPinned/,
	},
	{
		reason: "shared features",
		pattern: /features\.(update|delete)\(|updateFeature\(|deleteFeature\(/,
	},
];

const READ_CONCURRENCY = 64;

/** Reasons a test file must run alone on a worker, empty when it can share. */
export const soloReasons = (source: string) =>
	ORG_WIDE_MUTATIONS.filter(({ pattern }) => pattern.test(source)).map(
		({ reason }) => reason,
	);

/** Test ids whose source at the run's sha mutates org-wide state (repetitions follow their file). */
export const detectSoloFiles = async ({
	testIds,
	testsDirAtSha,
}: {
	testIds: string[];
	testsDirAtSha: string;
}): Promise<Set<string>> => {
	const limit = pLimit(READ_CONCURRENCY);
	const files = [
		...new Set(testIds.map((id) => splitRepetitionId({ id }).file)),
	];
	const soloFiles = new Set<string>();
	await Promise.all(
		files.map((file) =>
			limit(async () => {
				const source = await readFile(
					resolve(testsDirAtSha, file),
					"utf8",
				).catch(() => "");
				if (soloReasons(source).length > 0) soloFiles.add(file);
			}),
		),
	);
	return new Set(
		testIds.filter((id) => soloFiles.has(splitRepetitionId({ id }).file)),
	);
};
