import { runBuild } from "@tinybirdco/sdk/cli/commands/build";
import { sleep } from "../lib/sleep.js";
import type { TinybirdTarget } from "../lib/tinybirdTarget.js";

type Resource = { name: string; content: string };

/** Datafiles that need secrets Local/QA instances don't have (Postgres copies, S3 sink). */
const needsSecrets = ({ resource }: { resource: Resource }) =>
	/tb_secret|events_s3|s3_export_12oct26_alchemy/.test(resource.content);

/**
 * Generates resources from server/tinybird.config.json in memory and POSTs them to /v1/build,
 * dropping secret-dependent ones, so the checkout is never modified.
 */
export const buildProject = async ({
	target,
	serverDir,
}: {
	target: TinybirdTarget;
	serverDir: string;
}) => {
	process.env.TINYBIRD_TOKEN ??= target.token;
	process.env.TINYBIRD_API_URL ??= target.url;
	const generated = await runBuild({ dryRun: true, cwd: serverDir });
	if (!generated.success || !generated.build)
		throw new Error(`Generate failed: ${generated.error}`);

	const { datasources, pipes, connections = [] } = generated.build.resources;
	const all = [...datasources, ...pipes, ...connections];
	const skipped = all
		.filter((resource) => needsSecrets({ resource }))
		.map((r) => r.name);
	const keep = (list: Resource[]) =>
		list.filter((resource) => !needsSecrets({ resource }));

	const form = new FormData();
	const add = (list: Resource[], ext: string) => {
		for (const r of keep(list)) {
			form.append(
				"data_project://",
				new Blob([r.content], { type: "text/plain" }),
				`${r.name}.${ext}`,
			);
		}
	};
	add(datasources, "datasource");
	add(pipes, "pipe");
	add(connections, "connection");

	console.error(
		`  ${keep(datasources).length} datasources, ${keep(pipes).length} pipes; skipped (need secrets): ${skipped.join(", ")}`,
	);

	// Local answers /tokens before it can build ("502 Failed to get workspace"), so retry on 5xx.
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(`${target.url}/v1/build`, {
			method: "POST",
			headers: { Authorization: `Bearer ${target.token}` },
			body: form,
		}).catch(
			(error: Error) =>
				({ ok: false, status: 0, text: async () => error.message }) as const,
		);
		const text = await res.text();
		const body = safeJson(text);
		if (res.ok && body?.result !== "failed") return { skipped, result: body };
		const retryable = res.status === 0 || res.status >= 500;
		if (!retryable || attempt >= 12) {
			const errors = body?.errors
				?.map((e) => `[${e.filename ?? ""}] ${e.error}`)
				.join("\n");
			throw new Error(
				`Build failed (${res.status}): ${errors ?? text.slice(0, 2000)}`,
			);
		}
		console.error(
			`  build: ${res.status} ${text.slice(0, 160)} (retry ${attempt})`,
		);
		await sleep(5000);
	}
};

type BuildResponse = {
	result?: string;
	errors?: { filename?: string; error: string }[];
	build?: Record<string, unknown>;
};

const safeJson = (text: string): BuildResponse | null => {
	try {
		return JSON.parse(text) as BuildResponse;
	} catch {
		return null;
	}
};
