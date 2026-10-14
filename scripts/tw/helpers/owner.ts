import { userInfo } from "node:os";

const OWNER_ALLOWED = /[^a-z0-9-]/g;
const DASH_RUNS = /-+/g;
const EDGE_DASHES = /^-+|-+$/g;

const FALLBACK_OWNER = "unknown";

const RUN_SUFFIX_LENGTH = 6;
const RUN_SUFFIX_RADIX = 36;

const sanitize = (value: string): string =>
	value
		.toLowerCase()
		.replace(OWNER_ALLOWED, "-")
		.replace(DASH_RUNS, "-")
		.replace(EDGE_DASHES, "");

export const getOwner = (): string => {
	let raw = "";
	try {
		raw = userInfo().username ?? "";
	} catch {
		raw = "";
	}

	if (!raw) {
		raw = process.env.USER ?? process.env.USERNAME ?? "";
	}

	const sanitized = sanitize(raw);
	return sanitized || FALLBACK_OWNER;
};

export const newRunId = (): string => {
	const suffix = Math.random()
		.toString(RUN_SUFFIX_RADIX)
		.slice(2, 2 + RUN_SUFFIX_LENGTH)
		.padEnd(RUN_SUFFIX_LENGTH, "0");
	return `${Date.now().toString(RUN_SUFFIX_RADIX)}-${suffix}`;
};

export const sandboxName = (
	owner: string,
	runId: string,
	idx: number,
): string => `tw-${owner}-${runId}-${idx}`;

export const vercelTags = (
	owner: string,
	runId: string,
): { owner: string; run: string; kind: "bun-tw" } => ({
	owner,
	run: runId,
	kind: "bun-tw",
});

export const stripeMetadata = (
	owner: string,
	runId: string,
	orgId: string,
): {
	autumn_test: "true";
	autumn_tw_owner: string;
	autumn_tw_run: string;
	autumn_org_id: string;
	autumn_created_at: string;
} => ({
	autumn_test: "true",
	autumn_tw_owner: owner,
	autumn_tw_run: runId,
	autumn_org_id: orgId,
	autumn_created_at: String(Date.now()),
});

export const svixMetadata = (
	owner: string,
	runId: string,
): { autumn_tw_owner: string; autumn_tw_run: string } => ({
	autumn_tw_owner: owner,
	autumn_tw_run: runId,
});
