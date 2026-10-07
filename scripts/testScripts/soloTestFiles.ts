import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

const TESTS_ROOT = resolve(import.meta.dir, "../../server/tests");
// Shared test infra is skipped: its org-mutating exports are matched by name at call sites.
const SHARED_UTILS_DIR = `${TESTS_ROOT}/utils/`;
const IMPORT_SPECIFIER = /from\s+["']([^"']+)["']/g;

const isTestLocalHelper = ({ file }: { file: string }) =>
	file.startsWith(TESTS_ROOT) &&
	!file.startsWith(SHARED_UTILS_DIR) &&
	!file.endsWith(".test.ts");

const resolveTestImport = ({
	fromFile,
	specifier,
}: {
	fromFile: string;
	specifier: string;
}): string | null => {
	const base = specifier.startsWith(".")
		? resolve(dirname(fromFile), specifier)
		: specifier.startsWith("@tests/")
			? resolve(TESTS_ROOT, specifier.slice("@tests/".length))
			: null;
	if (!base) return null;

	const stem = base.replace(/\.js$/, "");
	const candidates = [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`];
	return (
		candidates.find(
			(candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate),
		) ?? null
	);
};

/** Whether a file, or a test-local helper it imports, mutates org-wide state. */
const createOrgMutationScanner = () => {
	const sources = new Map<string, Promise<string>>();
	// Only positives are cached: a negative found while cutting an import cycle may be partial.
	const mutating = new Set<string>();

	const readSource = ({ file }: { file: string }) => {
		const cached = sources.get(file);
		if (cached) return cached;
		const source = Bun.file(file)
			.text()
			.catch(() => "");
		sources.set(file, source);
		return source;
	};

	const scan = async ({
		file,
		visiting = new Set<string>(),
	}: {
		file: string;
		visiting?: Set<string>;
	}): Promise<boolean> => {
		if (mutating.has(file)) return true;
		if (visiting.has(file)) return false;
		visiting.add(file);

		const source = await readSource({ file });
		let mutates = soloReasons({ source }).length > 0;

		for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
			if (mutates) break;
			const helper = resolveTestImport({ fromFile: file, specifier });
			if (!helper || !isTestLocalHelper({ file: helper })) continue;
			mutates = await scan({ file: helper, visiting });
		}

		if (mutates) mutating.add(file);
		return mutates;
	};

	return { scan };
};

export const detectSoloFiles = async ({
	files,
}: {
	files: string[];
}): Promise<Set<string>> => {
	const scanner = createOrgMutationScanner();
	const solo = await Promise.all(
		files.map(async (file) =>
			(await scanner.scan({ file: resolve(file) })) ? file : null,
		),
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
