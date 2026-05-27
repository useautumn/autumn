import { Axiom } from "@axiomhq/js";
import { createTool } from "@mastra/core/tools";
import { add, differenceInMilliseconds, isValid, parseISO } from "date-fns";
import {
	makeScopeChecker,
	Scopes,
	type ScopeString,
} from "@autumn/shared/scopeDefinitions";
import { ms } from "@autumn/shared/unixUtils";
import * as z from "zod/v4";
import {
	getAutumnAuth,
	resolveAutumnOrgId,
	type AutumnMcpAuth,
} from "./auth.js";

const axiomDataset = "express";
const defaultStartTime = "now-30m";
const defaultEndTime = "now";
const maxRangeMs = ms.days(7);
const searchMaxRangeMs = ms.hours(1);

let axiomClient: Axiom | null = null;

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

const parseAxiomTime = (value: string, now = new Date()) => {
	if (value === "now") return now;

	const relative = value.match(/^now-(\d+)([mhd])$/);
	if (relative) {
		const count = Number(relative[1]);
		const unit = relative[2];
		return add(now, {
			minutes: unit === "m" ? -count : 0,
			hours: unit === "h" ? -count : 0,
			days: unit === "d" ? -count : 0,
		});
	}

	const absolute = parseISO(value);
	return isValid(absolute) ? absolute : null;
};

const getRangeMs = (startTime: string, endTime: string) => {
	const start = parseAxiomTime(startTime);
	const end = parseAxiomTime(endTime);
	if (start === null || end === null) return null;
	return differenceInMilliseconds(end, start);
};

const assertCanUseAxiom = (auth: AutumnMcpAuth) => {
	if (!makeScopeChecker(auth.scopes).has(Scopes.Analytics.Read as ScopeString)) {
		throw new Error("analytics:read scope is required to query Axiom logs.");
	}
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
		throw new Error("Axiom queries must use a bounded time range of at most 7 days.");
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
		throw new Error("Axiom queries may only use the express dataset source once.");
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
		].filter(Boolean).join("\n"),
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
		inputSchema: z.object({
			apl: z.string().min(1),
			startTime: z.string().optional(),
			endTime: z.string().optional(),
		}).strict(),
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
		inputSchema: z.object({
			dataset: z.literal(axiomDataset),
		}).strict(),
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
