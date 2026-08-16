import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ensureDevProxy } from "../devProxy/server.ts";
import type { RegistryEntry } from "../types.ts";
import { agentDir, machineId } from "./machineId.ts";
import { devProxyPortFor, ngrokApiPortFor } from "./ports.ts";
import { loadRegistry, saveRegistry, shortHash } from "./registry.ts";
import { log, sh } from "./shell.ts";

const NGROK_API = "https://api.ngrok.com";

export type ReservedDomain = { id: string; domain: string };

export function ngrokApiAvailable(): boolean {
	return Boolean(process.env.NGROK_API_KEY);
}

export function reservedDomainName({
	machineId: id,
	path,
	worktreeNum,
}: {
	machineId: string;
	path: string;
	worktreeNum: number;
}): string {
	return `autumn-wt${worktreeNum}-${shortHash(`${id}:${path}`)}.ngrok.app`;
}

function ngrokHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${process.env.NGROK_API_KEY}`,
		"Content-Type": "application/json",
		"Ngrok-Version": "2",
	};
}

async function findReservedDomain(
	name: string,
): Promise<ReservedDomain | undefined> {
	let next: string | null = "/reserved_domains";
	while (next) {
		const url: string = next.startsWith("http") ? next : `${NGROK_API}${next}`;
		const response = await fetch(url, { headers: ngrokHeaders() });
		if (!response.ok) {
			throw new Error(
				`ngrok list reserved_domains failed: ${response.status} ${await response.text()}`,
			);
		}
		const data = (await response.json()) as {
			reserved_domains: ReservedDomain[];
			next_page_uri: string | null;
		};
		const found = data.reserved_domains.find((d) => d.domain === name);
		if (found) return { domain: found.domain, id: found.id };
		next = data.next_page_uri;
	}
	return undefined;
}

export async function ensureReservedDomain({
	path,
	worktreeNum,
}: {
	path: string;
	worktreeNum: number;
}): Promise<ReservedDomain> {
	const name = reservedDomainName({
		machineId: machineId(),
		path,
		worktreeNum,
	});
	const existing = await findReservedDomain(name);
	if (existing) {
		log(`ngrok reserved domain ${existing.domain} (reused ${existing.id})`);
		return existing;
	}
	const response = await fetch(`${NGROK_API}/reserved_domains`, {
		body: JSON.stringify({ name }),
		headers: ngrokHeaders(),
		method: "POST",
	});
	if (!response.ok) {
		throw new Error(
			`ngrok create reserved_domain ${name} failed: ${response.status} ${await response.text()}`,
		);
	}
	const created = (await response.json()) as ReservedDomain;
	log(`ngrok reserved domain ${created.domain} (created ${created.id})`);
	return { domain: created.domain, id: created.id };
}

export async function deleteReservedDomain(id: string): Promise<void> {
	const response = await fetch(`${NGROK_API}/reserved_domains/${id}`, {
		headers: ngrokHeaders(),
		method: "DELETE",
	});
	if (response.status === 204 || response.status === 404) {
		log(`ngrok reserved domain ${id} released`);
		return;
	}
	log(
		`ngrok delete reserved domain ${id} failed: ${response.status} ${await response.text()}`,
	);
}

export function firstHttpsUrl(text: string): string | undefined {
	return text.match(/https:\/\/\S+/)?.[0]?.replace(/[.,;]+$/, "");
}

function publicUrlsFile(): string {
	return join(agentDir(), "public-urls.txt");
}

function writePublicUrls(origin: string): void {
	mkdirSync(agentDir(), { recursive: true });
	writeFileSync(publicUrlsFile(), `${origin.replace(/\/$/, "")}\n`);
}

function readPublicOrigin(): string | undefined {
	if (!existsSync(publicUrlsFile())) return undefined;
	return firstHttpsUrl(readFileSync(publicUrlsFile(), "utf8"));
}

export function publicOrigin({
	entry,
}: {
	entry: RegistryEntry;
}): string | undefined {
	const origin = entry.ngrokUrl ?? readPublicOrigin();
	if (origin) return origin.replace(/\/$/, "");
	return `http://localhost:${devProxyPortFor(entry.worktreeNum)}`;
}

function ngrokBinary(): string | undefined {
	const found = sh("bash", ["-lc", "command -v ngrok"]).stdout.trim();
	return found || undefined;
}

function inspectorUrl(worktreeNum: number): string {
	return `http://127.0.0.1:${ngrokApiPortFor(worktreeNum)}/api/tunnels`;
}

function inspectorUp(worktreeNum: number): boolean {
	return sh("curl", ["-sf", "--max-time", "1", inspectorUrl(worktreeNum)])
		.code === 0;
}

function waitForInspector(worktreeNum: number): boolean {
	for (let i = 0; i < 40; i++) {
		if (inspectorUp(worktreeNum)) return true;
		Bun.sleepSync(250);
	}
	return false;
}

function startHostNgrok({
	authtoken,
	domain,
	proxyPort,
	worktreeNum,
}: {
	authtoken: string;
	domain: string;
	proxyPort: number;
	worktreeNum: number;
}): void {
	if (inspectorUp(worktreeNum)) return;

	const dir = agentDir();
	mkdirSync(dir, { recursive: true });
	const cfg = join(dir, `ngrok-${worktreeNum}.yml`);
	const logFile = join(dir, `ngrok-${worktreeNum}.log`);
	writeFileSync(
		cfg,
		`version: "2"\nauthtoken: ${authtoken}\nweb_addr: 127.0.0.1:${ngrokApiPortFor(worktreeNum)}\n`,
	);
	chmodSync(cfg, 0o600);

	const started = Bun.spawnSync(
		[
			"bash",
			"-c",
			`nohup ngrok http ${proxyPort} --config "${cfg}" --url "https://${domain}" --log=stdout >"${logFile}" 2>&1 & echo $!`,
		],
		{ cwd: process.cwd() },
	);
	const pid = new TextDecoder().decode(started.stdout).trim();
	if (pid) writeFileSync(join(dir, `ngrok-${worktreeNum}.pid`), `${pid}\n`);
	if (!waitForInspector(worktreeNum)) {
		log(`ngrok inspector :${ngrokApiPortFor(worktreeNum)} did not come up`);
	}
}

function persistEntry(entry: RegistryEntry): RegistryEntry {
	const registry = loadRegistry();
	registry[entry.path] = { ...(registry[entry.path] ?? entry), ...entry };
	saveRegistry(registry);
	return entry;
}

/** Path proxy + one reserved hostname. Same path on laptop and Cloud. */
export async function ensureNgrok(
	entry: RegistryEntry,
	opts: { quiet?: boolean } = {},
): Promise<RegistryEntry> {
	const proxyPort = ensureDevProxy({ worktreeNum: entry.worktreeNum });
	let origin = entry.ngrokUrl;
	let reservedDomainId = entry.reservedDomainId;

	if (ngrokApiAvailable()) {
		try {
			const reserved = await ensureReservedDomain({
				path: entry.path,
				worktreeNum: entry.worktreeNum,
			});
			origin = `https://${reserved.domain}`;
			reservedDomainId = reserved.id;
		} catch (err) {
			if (!opts.quiet) {
				log(
					`ngrok reserve failed: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	const authtoken = process.env.NGROK_AUTHTOKEN;
	if (authtoken && origin && ngrokBinary()) {
		if (!opts.quiet) log(`ensuring ngrok ${origin} → :${proxyPort}`);
		startHostNgrok({
			authtoken,
			domain: new URL(origin).host,
			proxyPort,
			worktreeNum: entry.worktreeNum,
		});
	} else if (!origin) {
		origin = `http://localhost:${proxyPort}`;
	}

	if (origin) writePublicUrls(origin);
	const next: RegistryEntry = {
		...entry,
		...(origin && { ngrokUrl: origin, ngrokViteUrl: origin }),
		...(reservedDomainId && { reservedDomainId }),
	};
	persistEntry(next);
	if (!opts.quiet && next.ngrokUrl) log(`ngrok ${next.ngrokUrl}`);
	return next;
}
