#!/usr/bin/env bun
/** `twd` thin client: pure fetch over src/api/contract.ts. Base URL from TWD_URL. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
	ApiError,
	ApiKey,
	Capacity,
	CreateApiKeyResponse,
	EnqueueResponse,
	MAX_REPEAT,
	Me,
	RunEvent,
	RunSummary,
} from "../api/contract.ts";

const CREDENTIALS_FILE = join(homedir(), ".config", "twd", "credentials");
const BASE_URL = (process.env.TWD_URL ?? "http://localhost:4100").replace(
	/\/$/,
	"",
);
const TERMINAL = ["passed", "failed", "cancelled", "errored"];

const USAGE = `twd — test worker daemon client (TWD_URL=${BASE_URL})

  twd login [key]                         store an API key (mint one in the dashboard)
  twd run <groups|files…> [--branch=] [--grep=] [--workers=N | --files-per-worker=N] [--repeat=N] [--wait]
                                          starts as soon as one account is free, grows from there
  twd runs [--all] [--branch=]
  twd run-status <id>                     follow a run's events until it finishes
  twd cancel <id>
  twd capacity
  twd warm <branch>
  twd keys [create <name> | revoke <id>]`;

class CliError extends Error {}

const readApiKey = async () => {
	if (process.env.TWD_API_KEY) return process.env.TWD_API_KEY;
	const stored = await readFile(CREDENTIALS_FILE, "utf8").catch(() => "");
	const key = stored.trim();
	if (key) return key;
	throw new CliError(
		`not logged in.\n  next: run \`twd login\` with an API key from ${BASE_URL}/auth/google → API keys\n  escalate: ask a teammate for dashboard access / an API key`,
	);
};

const api = async <T>({
	method = "GET",
	path,
	body,
	schema,
	apiKey,
}: {
	method?: string;
	path: string;
	body?: unknown;
	schema: z.ZodType<T, z.ZodTypeDef, unknown>;
	apiKey?: string;
}): Promise<T> => {
	const res = await fetch(`${BASE_URL}/api${path}`, {
		method,
		headers: {
			authorization: `Bearer ${apiKey ?? (await readApiKey())}`,
			...(body !== undefined && { "content-type": "application/json" }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	}).catch((error: Error) => {
		throw new CliError(
			`cannot reach twd at ${BASE_URL} (${error.message}).\n  next: check TWD_URL`,
		);
	});
	const json: unknown = await res.json().catch(() => undefined);
	if (!res.ok) {
		const apiError = ApiError.safeParse(json);
		if (!apiError.success)
			throw new CliError(`${method} ${path} → HTTP ${res.status}`);
		const { code, message, next, escalate } = apiError.data.error;
		throw new CliError(
			[
				`${code}: ${message}`,
				`  next: ${next}`,
				escalate && `  escalate: ${escalate}`,
			]
				.filter(Boolean)
				.join("\n"),
		);
	}
	return schema.parse(json);
};

const gitBranch = () => {
	const out = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
	const branch = out.stdout.toString().trim();
	if (out.exitCode !== 0 || !branch || branch === "HEAD")
		throw new CliError(
			"could not detect the git branch.\n  next: pass --branch=<name>",
		);
	return branch;
};

const printRun = (run: z.infer<typeof RunSummary>) =>
	console.log(
		`${run.id}  ${run.status.padEnd(12)} ${run.branch}@${run.sha.slice(0, 8)}  ${run.passed}✓ ${run.failed}✗  files=${run.fileCount ?? "?"}  workers=${run.workerCount ?? 0}/${run.workersWanted ?? "?"}${run.queuePosition === null ? "" : `  queue=#${run.queuePosition}`}  $${run.cost.usd.toFixed(2)}  by ${run.createdBy.email}`,
	);

/** Keeps colours (SGR) but drops every other escape/control sequence test output might carry. */
const safeText = (text: string) =>
	text
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal escapes
		.replace(
			/\u001B\](?:[^\u0007\u001B]|\u001B(?!\\))*(?:\u0007|\u001B\\)/g,
			"",
		)
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal escapes
		.replace(/\u001B\[[0-9;?]*[A-Za-ln-z]/g, "")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal escapes
		.replace(/[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g, "");

const printEvent = (event: z.infer<typeof RunEvent>) => {
	if (event.type === "status")
		console.log(`» ${event.status}${event.phase ? ` (${event.phase})` : ""}`);
	else if (event.type === "file")
		console.log(
			`  ${event.file.status.padEnd(9)} ${event.file.file}${event.file.durationMs === null ? "" : ` ${(event.file.durationMs / 1000).toFixed(1)}s`}${event.file.failureSummary ? `\n    ${safeText(event.file.failureSummary)}` : ""}`,
		);
	else if (event.type === "log")
		console.log(
			`  [${event.worker ?? event.file ?? "log"}] ${safeText(event.text)}`,
		);
};

/** Streams SSE until a terminal status; returns that status. */
const followRun = async ({ id }: { id: string }) => {
	const run = await api({ path: `/runs/${id}`, schema: RunSummary });
	printRun(run);
	if (TERMINAL.includes(run.status)) return run.status;

	const res = await fetch(`${BASE_URL}/api/runs/${id}/events`, {
		headers: {
			authorization: `Bearer ${await readApiKey()}`,
			accept: "text/event-stream",
		},
	});
	if (!res.ok || !res.body)
		throw new CliError(`event stream failed (HTTP ${res.status})`);
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of res.body) {
		buffer += decoder.decode(chunk, { stream: true });
		const frames = buffer.split(/\r?\n\r?\n/);
		buffer = frames.pop() ?? "";
		for (const frame of frames) {
			const data = frame
				.split(/\r?\n/)
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart())
				.join("\n");
			if (!data) continue;
			const event = RunEvent.safeParse(JSON.parse(data));
			if (!event.success) continue;
			printEvent(event.data);
			if (event.data.type === "status" && TERMINAL.includes(event.data.status))
				return event.data.status;
		}
	}
	return (await api({ path: `/runs/${id}`, schema: RunSummary })).status;
};

const commands: Record<
	string,
	(args: string[]) => Promise<number | undefined>
> = {
	login: async ([given]) => {
		const key = (
			given ??
			prompt("Paste your twd API key (twd_…):") ??
			""
		).trim();
		if (!key.startsWith("twd_"))
			throw new CliError(
				`that doesn't look like a twd key.\n  next: mint one at ${BASE_URL} → API keys, then \`twd login twd_…\``,
			);
		const me = await api({ path: "/me", schema: Me, apiKey: key });
		await mkdir(dirname(CREDENTIALS_FILE), { recursive: true });
		await writeFile(CREDENTIALS_FILE, `${key}\n`, { mode: 0o600 });
		console.log(
			`logged in as ${me.email} (${me.via}); saved ${CREDENTIALS_FILE}`,
		);
		return 0;
	},

	run: async (args) => {
		const { values, positionals } = parseArgs({
			args,
			allowPositionals: true,
			options: {
				branch: { type: "string" },
				grep: { type: "string" },
				workers: { type: "string" },
				"files-per-worker": { type: "string" },
				repeat: { type: "string" },
				wait: { type: "boolean" },
			},
		});
		if (!positionals.length && !values.grep)
			throw new CliError(
				"nothing selected.\n  next: twd run <group|file…> [--grep=]",
			);
		const repeat =
			values.repeat === undefined ? undefined : Number(values.repeat);
		if (
			repeat !== undefined &&
			!(Number.isInteger(repeat) && repeat >= 1 && repeat <= MAX_REPEAT)
		)
			throw new CliError(
				`--repeat must be a whole number from 1 to ${MAX_REPEAT}.\n  next: twd run <file> --repeat=10 (flaky checks only)`,
			);
		const isFile = (s: string) => s.includes("/") || s.endsWith(".ts");
		const files = positionals.filter(isFile);
		const groups = positionals.filter((s) => !isFile(s));
		const run = await api({
			method: "POST",
			path: "/runs",
			schema: z.union([
				RunSummary,
				z.object({ run: RunSummary }).transform((r) => r.run),
			]),
			body: {
				branch: values.branch ?? gitBranch(),
				...(values.workers && { maxWorkers: Number(values.workers) }),
				...(values["files-per-worker"] && {
					maxFilesPerWorker: Number(values["files-per-worker"]),
				}),
				...(repeat !== undefined && { repeat }),
				selection: {
					...(groups.length && { groups }),
					...(files.length && { files }),
					...(values.grep && { grep: values.grep }),
				},
			},
		});
		printRun(run);
		if (!values.wait) {
			console.log(`follow: twd run-status ${run.id}`);
			return 0;
		}
		return (await followRun({ id: run.id })) === "passed" ? 0 : 1;
	},

	runs: async (args) => {
		const { values } = parseArgs({
			args,
			options: { all: { type: "boolean" }, branch: { type: "string" } },
		});
		const query = new URLSearchParams({ status: values.all ? "all" : "live" });
		if (values.branch) query.set("branch", values.branch);
		const runs = await api({
			path: `/runs?${query}`,
			schema: z.union([
				z.array(RunSummary),
				z.object({ runs: z.array(RunSummary) }).transform((r) => r.runs),
			]),
		});
		if (!runs.length) console.log("no runs");
		runs.forEach(printRun);
		return 0;
	},

	"run-status": async ([id]) => {
		if (!id) throw new CliError("usage: twd run-status <id>");
		return (await followRun({ id })) === "passed" ? 0 : 1;
	},

	cancel: async ([id]) => {
		if (!id) throw new CliError("usage: twd cancel <id>");
		await api({
			method: "POST",
			path: `/runs/${id}/cancel`,
			schema: z.unknown(),
		});
		console.log(`cancel requested for ${id}`);
		return 0;
	},

	capacity: async () => {
		const cap = await api({ path: "/capacity", schema: Capacity });
		const a = cap.accounts;
		console.log(
			[
				`gate        ${cap.gate}`,
				`usable keys ${cap.usableKeys}`,
				`accounts    clean=${a.clean} in_use=${a.inUse} nuking=${a.nuking} broken=${a.broken} (cap ${cap.poolCap})`,
				`live runs   ${cap.liveRuns} (${cap.queuedRuns} queued, ${cap.accountsWanted} accounts wanted)`,
				`new run     ${cap.maxFilesNow} worker(s) now; runs queue FIFO and grow as accounts free up`,
				`warm builds ${cap.warmBuilds}`,
			].join("\n"),
		);
		return 0;
	},

	warm: async ([branch]) => {
		if (!branch) throw new CliError("usage: twd warm <branch>");
		const { job, deduped } = await api({
			method: "POST",
			path: `/branches/${encodeURIComponent(branch)}/warm`,
			schema: EnqueueResponse,
		});
		console.log(
			`${deduped ? "attached to" : "queued"} ${job.singletonKey} (job ${job.id}, ${job.status})`,
		);
		return 0;
	},

	keys: async ([sub, arg]) => {
		if (sub === "create") {
			if (!arg) throw new CliError("usage: twd keys create <name>");
			const { apiKey, secret } = await api({
				method: "POST",
				path: "/api-keys",
				body: { name: arg },
				schema: CreateApiKeyResponse,
			});
			console.log(
				`created ${apiKey.id} (${apiKey.name})\n${secret}\n(shown once)`,
			);
			return 0;
		}
		if (sub === "revoke") {
			if (!arg) throw new CliError("usage: twd keys revoke <id>");
			await api({
				method: "DELETE",
				path: `/api-keys/${arg}`,
				schema: z.unknown(),
			});
			console.log(`revoked ${arg}`);
			return 0;
		}
		const keys = await api({ path: "/api-keys", schema: z.array(ApiKey) });
		for (const key of keys)
			console.log(
				`${key.id}  ${key.prefix}…  ${key.name.padEnd(20)} ${key.ownerEmail}  ${key.revokedAt ? "revoked" : `last used ${key.lastUsedAt ?? "never"}`}`,
			);
		return 0;
	},
};

const [name, ...rest] = process.argv.slice(2);
const command = name ? commands[name] : undefined;
if (!command) {
	console.log(USAGE);
	process.exit(name && name !== "help" ? 1 : 0);
}
try {
	process.exit((await command(rest)) ?? 0);
} catch (error) {
	if (!(error instanceof CliError)) throw error;
	console.error(`twd: ${error.message}`);
	process.exit(1);
}
