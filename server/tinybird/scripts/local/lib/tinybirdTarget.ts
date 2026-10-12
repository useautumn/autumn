import { sleep } from "./sleep.js";

export type TinybirdTarget = {
	url: string;
	token: string;
	workspace: string | null;
};

type TargetFlags = {
	url?: string;
	token?: string;
	workspace?: string;
	allowCloud?: boolean;
};

type LocalTokens = { admin_token: string; user_token: string };
type LocalWorkspace = { id: string; name: string; token: string };

const DEFAULT_URL = "http://localhost:7181";
const DEFAULT_WORKSPACE = "dev";

/** Seed/reset/build mutate data, so a Tinybird Cloud host is refused unless explicitly allowed. */
const assertNotCloud = ({
	url,
	allowCloud,
}: {
	url: string;
	allowCloud?: boolean;
}) => {
	const host = new URL(url).hostname;
	if (!allowCloud && host.endsWith("tinybird.co")) {
		throw new Error(
			`Refusing to target Tinybird Cloud (${host}). These scripts are for Tinybird Local / QA instances.`,
		);
	}
};

export const fetchWithRetry = async ({
	url,
	init,
	attempts = 12,
	delayMs = 5000,
	label,
}: {
	url: string;
	init?: RequestInit;
	attempts?: number;
	delayMs?: number;
	label: string;
}): Promise<Response> => {
	let lastError = "";
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const res = await fetch(url, init);
			if (res.status < 500 && res.status !== 429) return res;
			lastError = `${res.status} ${(await res.text()).replace(/<[^>]*>|\s+/g, " ").trim()}`;
		} catch (error) {
			lastError = (error as Error).message;
		}
		if (attempt < attempts) {
			console.error(
				`  ${label}: ${lastError.slice(0, 160)} (retry ${attempt}/${attempts - 1})`,
			);
			await sleep(delayMs);
		}
	}
	throw new Error(
		`${label} failed after ${attempts} attempts: ${lastError.slice(0, 500)}`,
	);
};

const getLocalTokens = async ({
	url,
}: {
	url: string;
}): Promise<LocalTokens> => {
	const res = await fetchWithRetry({
		url: `${url}/tokens`,
		label: "GET /tokens",
	});
	if (!res.ok)
		throw new Error(
			`GET ${url}/tokens returned ${res.status}; pass --token instead.`,
		);
	return (await res.json()) as LocalTokens;
};

const listWorkspaces = async ({
	url,
	tokens,
}: {
	url: string;
	tokens: LocalTokens;
}) => {
	const res = await fetchWithRetry({
		url: `${url}/v1/user/workspaces?with_organization=true`,
		init: { headers: { Authorization: `Bearer ${tokens.admin_token}` } },
		label: "list workspaces",
	});
	if (!res.ok)
		throw new Error(`list workspaces: ${res.status} ${await res.text()}`);
	return (await res.json()) as {
		workspaces: LocalWorkspace[];
		organization_id?: string;
	};
};

const getOrCreateWorkspace = async ({
	url,
	name,
}: {
	url: string;
	name: string;
}): Promise<LocalWorkspace> => {
	const tokens = await getLocalTokens({ url });
	const listed = await listWorkspaces({ url, tokens });
	const existing = listed.workspaces.find((ws) => ws.name === name);
	if (existing) return existing;

	const body = new URLSearchParams({ name });
	if (listed.organization_id)
		body.set("assign_to_organization_id", listed.organization_id);
	const res = await fetchWithRetry({
		url: `${url}/v1/workspaces`,
		init: {
			method: "POST",
			headers: {
				Authorization: `Bearer ${tokens.user_token}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body,
		},
		label: "create workspace",
	});
	if (!res.ok)
		throw new Error(
			`create workspace ${name}: ${res.status} ${await res.text()}`,
		);
	const created = (await listWorkspaces({ url, tokens })).workspaces.find(
		(ws) => ws.name === name,
	);
	if (!created)
		throw new Error(`Created workspace ${name} but it is not listed`);
	console.error(`  created workspace ${name}`);
	return created;
};

/** Resolves a workspace token from --token, or from Local's /tokens endpoint and --workspace. */
export const resolveTarget = async (
	flags: TargetFlags,
): Promise<TinybirdTarget> => {
	const url = (flags.url ?? process.env.TB_LOCAL_URL ?? DEFAULT_URL).replace(
		/\/$/,
		"",
	);
	assertNotCloud({ url, allowCloud: flags.allowCloud });

	const token = flags.token ?? process.env.TB_LOCAL_TOKEN;
	if (token) return { url, token, workspace: null };

	const name =
		flags.workspace ?? process.env.TB_LOCAL_WORKSPACE ?? DEFAULT_WORKSPACE;
	const workspace = await getOrCreateWorkspace({ url, name });
	return { url, token: workspace.token, workspace: workspace.name };
};
