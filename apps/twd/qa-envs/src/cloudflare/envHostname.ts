import type { Env } from "../types";

const API = "https://api.cloudflare.com/client/v4";
const RECORD_COMMENT = "twd qa env";

type CfResult<T> = {
	success: boolean;
	result: T;
	errors: { message: string }[];
};

async function cf<T>({
	env,
	path,
	init,
}: {
	env: Env;
	path: string;
	init?: RequestInit;
}) {
	const res = await fetch(`${API}/zones/${env.CLOUDFLARE_ZONE_ID}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			"content-type": "application/json",
		},
	});
	const body = (await res.json()) as CfResult<T>;
	if (!body.success)
		throw new Error(
			`cloudflare ${path}: ${body.errors.map((e) => e.message).join("; ")}`,
		);
	return body.result;
}

type DnsRecord = { id: string; name: string; comment?: string | null };
type WorkerRoute = { id: string; pattern: string };

const hostname = ({ env, name }: { env: Env; name: string }) =>
	`${name}.${env.QA_DOMAIN}`;

/** A hostname another project already uses must never be taken over by a QA env. */
export async function isHostnameFree({
	env,
	name,
}: {
	env: Env;
	name: string;
}) {
	const records = await cf<DnsRecord[]>({
		env,
		path: `/dns_records?name=${hostname({ env, name })}`,
	});
	return records.every((r) => r.comment === RECORD_COMMENT);
}

/** Proxied placeholder record plus a Worker route, so `<name>.<domain>` reaches this Worker. */
export async function ensureEnvHostname({
	env,
	name,
	script,
}: {
	env: Env;
	name: string;
	script: string;
}) {
	const host = hostname({ env, name });
	const records = await cf<DnsRecord[]>({
		env,
		path: `/dns_records?name=${host}`,
	});
	if (records.length === 0)
		await cf({
			env,
			path: "/dns_records",
			init: {
				method: "POST",
				body: JSON.stringify({
					type: "AAAA",
					name: host,
					content: "100::",
					proxied: true,
					comment: RECORD_COMMENT,
				}),
			},
		});
	const routes = await cf<WorkerRoute[]>({ env, path: "/workers/routes" });
	if (!routes.some((r) => r.pattern === `${host}/*`))
		await cf({
			env,
			path: "/workers/routes",
			init: {
				method: "POST",
				body: JSON.stringify({ pattern: `${host}/*`, script }),
			},
		});
}

export async function deleteEnvHostname({
	env,
	name,
}: {
	env: Env;
	name: string;
}) {
	const host = hostname({ env, name });
	const routes = await cf<WorkerRoute[]>({ env, path: "/workers/routes" });
	for (const route of routes.filter((r) => r.pattern === `${host}/*`))
		await cf({
			env,
			path: `/workers/routes/${route.id}`,
			init: { method: "DELETE" },
		});
	const records = await cf<DnsRecord[]>({
		env,
		path: `/dns_records?name=${host}`,
	});
	for (const record of records.filter((r) => r.comment === RECORD_COMMENT))
		await cf({
			env,
			path: `/dns_records/${record.id}`,
			init: { method: "DELETE" },
		});
}
