import { fetchWithRetry, type TinybirdTarget } from "./tinybirdTarget.js";

export type SqlRow = Record<string, unknown>;

const authHeaders = ({ target }: { target: TinybirdTarget }) => ({
	Authorization: `Bearer ${target.token}`,
});

/** Runs a read query through /v0/sql (Local caps these at 10s). */
export const querySql = async <T extends SqlRow = SqlRow>({
	target,
	sql,
}: {
	target: TinybirdTarget;
	sql: string;
}): Promise<T[]> => {
	const res = await fetchWithRetry({
		url: `${target.url}/v0/sql`,
		init: {
			method: "POST",
			headers: {
				...authHeaders({ target }),
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ q: `${sql} FORMAT JSON` }),
		},
		attempts: 3,
		label: "POST /v0/sql",
	});
	const text = await res.text();
	if (!res.ok)
		throw new Error(
			`SQL failed (${res.status}): ${text.slice(0, 800)}\n${sql}`,
		);
	return (JSON.parse(text) as { data: T[] }).data;
};

export const listDatasourceNames = async ({
	target,
}: {
	target: TinybirdTarget;
}) => {
	const res = await fetchWithRetry({
		url: `${target.url}/v0/datasources`,
		init: { headers: authHeaders({ target }) },
		label: "list datasources",
	});
	if (!res.ok)
		throw new Error(`list datasources: ${res.status} ${await res.text()}`);
	const body = (await res.json()) as { datasources: { name: string }[] };
	return body.datasources.map((ds) => ds.name);
};

export const truncateDatasource = async ({
	target,
	name,
}: {
	target: TinybirdTarget;
	name: string;
}) => {
	const res = await fetchWithRetry({
		url: `${target.url}/v0/datasources/${name}/truncate`,
		init: { method: "POST", headers: authHeaders({ target }) },
		label: `truncate ${name}`,
	});
	if (!res.ok)
		throw new Error(`truncate ${name}: ${res.status} ${await res.text()}`);
};

/** Sends one NDJSON batch through the Events API (the production ingest path), gzipped for tunnels. */
export const ingestNdjson = async ({
	target,
	datasource,
	ndjson,
}: {
	target: TinybirdTarget;
	datasource: string;
	ndjson: string;
}) => {
	const res = await fetch(
		`${target.url}/v0/events?name=${datasource}&wait=true`,
		{
			method: "POST",
			headers: { ...authHeaders({ target }), "Content-Encoding": "gzip" },
			body: Bun.gzipSync(ndjson),
		},
	);
	const text = await res.text();
	if (!res.ok)
		throw new Error(
			`ingest ${datasource}: ${res.status} ${text.slice(0, 800)}`,
		);
	const body = JSON.parse(text) as { quarantined_rows?: number };
	if (body.quarantined_rows)
		throw new Error(
			`ingest ${datasource}: rows quarantined: ${text.slice(0, 800)}`,
		);
};

/** Datasources API append: one request is exactly one ClickHouse insert, unlike the buffered Events API. */
export const appendNdjson = async ({
	target,
	datasource,
	ndjson,
}: {
	target: TinybirdTarget;
	datasource: string;
	ndjson: string;
}) => {
	const form = new FormData();
	form.append(
		"ndjson",
		new Blob([ndjson], { type: "application/x-ndjson" }),
		"batch.ndjson",
	);
	const res = await fetch(
		`${target.url}/v0/datasources?name=${datasource}&mode=append&format=ndjson`,
		{
			method: "POST",
			headers: authHeaders({ target }),
			body: form,
		},
	);
	const text = await res.text();
	if (!res.ok)
		throw new Error(
			`append ${datasource}: ${res.status} ${text.slice(0, 800)}`,
		);
	const body = JSON.parse(text) as {
		invalid_lines?: number;
		quarantine_rows?: number;
	};
	if (body.invalid_lines || body.quarantine_rows)
		throw new Error(
			`append ${datasource}: rows rejected: ${text.slice(0, 800)}`,
		);
};

export const callPipe = async <T extends SqlRow = SqlRow>({
	target,
	pipe,
	params,
}: {
	target: TinybirdTarget;
	pipe: string;
	params: Record<string, string>;
}) => {
	const res = await fetchWithRetry({
		url: `${target.url}/v0/pipes/${pipe}.json?${new URLSearchParams(params)}`,
		init: { headers: authHeaders({ target }) },
		attempts: 3,
		label: `pipe ${pipe}`,
	});
	const text = await res.text();
	if (!res.ok)
		throw new Error(`pipe ${pipe}: ${res.status} ${text.slice(0, 800)}`);
	return (JSON.parse(text) as { data: T[] }).data;
};
