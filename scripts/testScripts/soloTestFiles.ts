import pLimit from "p-limit";

/** A test can opt out of sharing the run with `// tw:solo` anywhere in the file. */
const SOLO_MARKER = "tw:solo";

/** Calls that change state every concurrently running file shares: the one test org, its config, caches and catalog. */
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

/** Reasons a test file must run with nothing else in flight, empty when it can share. */
export const soloReasons = ({ source }: { source: string }) =>
	ORG_WIDE_MUTATIONS.filter(({ pattern }) => pattern.test(source)).map(
		({ reason }) => reason,
	);

export const detectSoloFiles = async ({
	files,
}: {
	files: string[];
}): Promise<Set<string>> => {
	const solo = await Promise.all(
		files.map(async (file) => {
			const source = await Bun.file(file)
				.text()
				.catch(() => "");
			return soloReasons({ source }).length > 0 ? file : null;
		}),
	);
	return new Set(solo.filter((file): file is string => file !== null));
};

/** Runs shared items up to `maxParallel` at once, then each solo item on its own. */
export const runSoloItemsAlone = async <T>({
	items,
	isSolo,
	maxParallel,
	run,
}: {
	items: T[];
	isSolo: (item: T) => boolean;
	maxParallel: number;
	run: (params: {
		item: T;
		limit: ReturnType<typeof pLimit>;
	}) => Promise<unknown>;
}): Promise<void> => {
	const sharedLimit = pLimit(maxParallel);
	await Promise.all(
		items
			.filter((item) => !isSolo(item))
			.map((item) => run({ item, limit: sharedLimit })),
	);

	const soloLimit = pLimit(1);
	await Promise.all(
		items.filter(isSolo).map((item) => run({ item, limit: soloLimit })),
	);
};
