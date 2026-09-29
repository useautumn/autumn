import { isBlacklistedStripePath } from "../stripeGet/validateStripeReadRequest.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;

type OpenApiOperation = {
	summary?: string;
	description?: string;
	parameters?: { name?: string; in?: string }[];
};

type OpenApiSpec = {
	paths?: Record<string, Record<string, OpenApiOperation | undefined>>;
};

export type StripeEndpoint = {
	path: string;
	method: "GET";
	summary: string;
	query_params: string[];
};

type IndexedEndpoint = { endpoint: StripeEndpoint; description: string };

const buildIndex = ({ spec }: { spec: OpenApiSpec }): IndexedEndpoint[] =>
	Object.entries(spec.paths ?? {}).flatMap(([path, methods]) => {
		const get = methods.get;
		if (!get || isBlacklistedStripePath({ path })) return [];
		return [
			{
				endpoint: {
					path,
					method: "GET" as const,
					summary: get.summary ?? "",
					query_params: (get.parameters ?? [])
						.filter((parameter) => parameter.in === "query" && parameter.name)
						.map((parameter) => parameter.name as string),
				},
				description: get.description ?? "",
			},
		];
	});

const scoreEndpoint = ({
	indexed,
	terms,
}: {
	indexed: IndexedEndpoint;
	terms: string[];
}) => {
	const path = indexed.endpoint.path.toLowerCase();
	const summary = indexed.endpoint.summary.toLowerCase();
	const description = indexed.description.toLowerCase();
	return terms.reduce(
		(score, term) =>
			score +
			(path.includes(term) ? 3 : 0) +
			(summary.includes(term) ? 2 : 0) +
			(description.includes(term) ? 1 : 0),
		0,
	);
};

export const createStripeEndpointSearch = ({
	fetchSpec,
	ttlMs = DEFAULT_TTL_MS,
	now = Date.now,
}: {
	fetchSpec: () => Promise<OpenApiSpec>;
	ttlMs?: number;
	now?: () => number;
}) => {
	let cached: { index: IndexedEndpoint[]; fetchedAt: number } | undefined;

	const getIndex = async () => {
		if (cached && now() - cached.fetchedAt <= ttlMs) return cached.index;
		const index = buildIndex({ spec: await fetchSpec() });
		cached = { index, fetchedAt: now() };
		return index;
	};

	return async ({
		query,
		limit = DEFAULT_LIMIT,
	}: {
		query: string;
		limit?: number;
	}): Promise<{ endpoints: StripeEndpoint[] }> => {
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
		const ranked = (await getIndex())
			.map((indexed) => ({ indexed, score: scoreEndpoint({ indexed, terms }) }))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score);
		return {
			endpoints: ranked.slice(0, limit).map(({ indexed }) => indexed.endpoint),
		};
	};
};
