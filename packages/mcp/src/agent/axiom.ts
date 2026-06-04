import { createHash } from "node:crypto";
import {
	makeScopeChecker,
	type ScopeString,
	Scopes,
} from "@autumn/shared/scopeDefinitions";
import { ms } from "@autumn/shared/unixUtils";
import { Axiom } from "@axiomhq/js";
import { createTool } from "@mastra/core/tools";
import {
	add,
	addMilliseconds,
	differenceInMilliseconds,
	isFuture,
	isValid,
	parseISO,
} from "date-fns";
import * as z from "zod/v4";
import {
	type AutumnMcpAuth,
	createAutumnClient,
	getAutumnAuth,
} from "../server/auth/auth.js";

const axiomDataset = "express";
const defaultStartTime = "now-30m";
const defaultEndTime = "now";
const maxRangeMs = ms.days(7);
const searchMaxRangeMs = ms.hours(1);

type AutumnOrg = { id: string; slug?: string | undefined };

let axiomClient: Axiom | null = null;
const orgCache = new Map<string, { org: AutumnOrg; expiresAt: Date }>();

const getAxiomClient = () => {
	if (!process.env.AXIOM_ADMIN_TOKEN) {
		throw new Error("Axiom is not configured (AXIOM_ADMIN_TOKEN missing).");
	}

	axiomClient ??= new Axiom({
		token: process.env.AXIOM_ADMIN_TOKEN,
		orgId: process.env.AXIOM_ORG_ID,
	});

	return axiomClient;
};

const escapeAplString = (value: string) =>
	value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 32);

const parseAxiomTime = (value: string, now = new Date()) => {
	if (value === "now") return now;

	const relative = value.match(/^now-(\d+)([mhd])$/);
	if (relative) {
		const count = Number(relative[1]);
		if (!Number.isFinite(count)) return null;
		const unit = relative[2];
		const date = add(now, {
			minutes: unit === "m" ? -count : 0,
			hours: unit === "h" ? -count : 0,
			days: unit === "d" ? -count : 0,
		});
		return isValid(date) ? date : null;
	}

	const absolute = parseISO(value);
	return isValid(absolute) ? absolute : null;
};

const getRangeMs = (startTime: string, endTime: string) => {
	const start = parseAxiomTime(startTime);
	const end = parseAxiomTime(endTime);
	if (start === null || end === null) return null;
	const rangeMs = differenceInMilliseconds(end, start);
	return Number.isFinite(rangeMs) ? rangeMs : null;
};

const assertCanUseAxiom = (auth: AutumnMcpAuth) => {
	if (
		!makeScopeChecker(auth.scopes).has(Scopes.Analytics.Read as ScopeString)
	) {
		throw new Error("analytics:read scope is required to query Axiom logs.");
	}
};

/**
 * Resolves the Autumn org (id + slug) for an authenticated request. Cached
 * (~5min) per credential. Unlike `resolveAutumnOrgId`, this always hits
 * `/v1/organization` when uncached so the slug is available — the id alone may
 * already be on `auth`, but the slug never is.
 */
export const resolveAutumnOrg = async (
	auth: AutumnMcpAuth,
): Promise<AutumnOrg> => {
	const cacheKey = [
		auth.serverURL ?? "https://api.useautumn.com",
		auth.env,
		hash(auth.apiKey),
		auth.xApiVersion ?? "2.3.0",
		String(auth.failOpen),
	].join(":");
	const cached = orgCache.get(cacheKey);
	if (cached && isFuture(cached.expiresAt)) return cached.org;

	const client = createAutumnClient(auth);
	const response = await fetch(new URL("/v1/organization", client.baseUrl), {
		method: "GET",
		headers: client.headers,
	});
	if (!response.ok) {
		throw new Error("Could not resolve Autumn organization for MCP request.");
	}

	const body = (await response.json()) as { id?: unknown; slug?: unknown };
	if (typeof body.id !== "string" || !body.id) {
		throw new Error("Autumn organization response did not include an id.");
	}

	const org: AutumnOrg = {
		id: body.id,
		slug: typeof body.slug === "string" ? body.slug : undefined,
	};
	orgCache.set(cacheKey, {
		org,
		expiresAt: addMilliseconds(new Date(), ms.minutes(5)),
	});

	return org;
};

export const resolveAutumnOrgId = async (auth: AutumnMcpAuth) => {
	if (auth.orgId) return auth.orgId;
	return (await resolveAutumnOrg(auth)).id;
};

export const prepareAxiomQuery = ({
	auth,
	apl,
	startTime = defaultStartTime,
	endTime = defaultEndTime,
}: {
	auth: AutumnMcpAuth & { orgId: string };
	apl: string;
	startTime?: string | undefined;
	endTime?: string | undefined;
}) => {
	assertCanUseAxiom(auth);

	const rangeMs = getRangeMs(startTime, endTime);
	if (rangeMs === null || rangeMs <= 0 || rangeMs > maxRangeMs) {
		throw new Error(
			"Axiom queries must use a bounded time range of at most 7 days.",
		);
	}

	const trimmed = apl.trim();
	const source = trimmed.match(/^\[\s*(['"])express\1\s*\](.*)$/is);
	if (!source) {
		throw new Error("Axiom queries must start from ['express'].");
	}

	const rest = source[2].trim();
	if (rest && !rest.startsWith("|")) {
		throw new Error("Axiom queries must pipe from the express dataset source.");
	}

	if (/\b(union|join|fork|lookup)\b/i.test(rest)) {
		throw new Error("Axiom query shape is not allowed.");
	}

	if (/\|\s*\[\s*['"][^'"]+['"]\s*\](?=\s*(?:\||$))/i.test(rest)) {
		throw new Error(
			"Axiom queries may only use the express dataset source once.",
		);
	}

	if (/\bsearch\b/i.test(rest) && rangeMs > searchMaxRangeMs) {
		throw new Error("Search queries must use a time range of at most 1 hour.");
	}

	return {
		apl: [
			"['express']",
			`| where ['context.org_id'] == '${escapeAplString(auth.orgId)}'`,
			`| where ['context.env'] == '${escapeAplString(auth.env)}'`,
			rest,
		]
			.filter(Boolean)
			.join("\n"),
		startTime,
		endTime,
	};
};

const withAxiomOrg = async (auth: AutumnMcpAuth) => {
	return { ...auth, orgId: await resolveAutumnOrgId(auth) };
};

export const createAxiomTools = () => ({
	queryAxiomLogs: createTool({
		id: "queryAxiomLogs",
		description:
			"Run a read-only Axiom APL query against Autumn logs. The query is always constrained to the authenticated Autumn org and environment.",
		inputSchema: z
			.object({
				apl: z.string().min(1),
				startTime: z.string().optional(),
				endTime: z.string().optional(),
			})
			.strict(),
		execute: async ({ apl, startTime, endTime }, context) => {
			const auth = await withAxiomOrg(getAutumnAuth(context));
			const query = prepareAxiomQuery({ auth, apl, startTime, endTime });
			return getAxiomClient().query(query.apl, {
				startTime: query.startTime,
				endTime: query.endTime,
			});
		},
	}),
	getAxiomDatasetFields: createTool({
		id: "getAxiomDatasetFields",
		description:
			"List available Axiom field metadata for the express dataset, scoped to the authenticated Autumn org and environment.",
		inputSchema: z
			.object({
				dataset: z.literal(axiomDataset),
			})
			.strict(),
		execute: async ({ dataset }, context) => {
			const auth = await withAxiomOrg(getAutumnAuth(context));
			const query = prepareAxiomQuery({
				auth,
				apl: `['${dataset}'] | limit 1`,
			});
			const result = await getAxiomClient().query(query.apl, {
				startTime: query.startTime,
				endTime: query.endTime,
				format: "tabular",
			});

			return {
				dataset,
				fields: result.fieldsMetaMap?.[dataset] ?? [],
			};
		},
	}),
});
