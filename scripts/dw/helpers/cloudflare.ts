import {
	chmodSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	dashboardSlug,
	PUBLIC_DEV_SERVICES,
	PUBLIC_DEV_ZONE,
	type PublicDevService,
	publicHostname,
	publicServiceHostname,
	publicServiceUrls,
	publicTunnelIngress,
	publicTunnelName,
	renderTunnelConfig,
} from "../devProxy/cloudflareConfig.ts";
import type { RegistryEntry } from "../types.ts";
import { ensureEmulateRunning } from "./emulate.ts";
import { writeEnvLocalFiles } from "./env-files.ts";
import { agentDir, machineId } from "./machineId.ts";
import { releaseNgrokIfPresent } from "./ngrok.ts";
import {
	checkoutPortFor,
	EMULATE_PORT,
	leafPortFor,
	serverPortFor,
	vitePortFor,
} from "./ports.ts";
import { entryPublicOrigin } from "./publicUrls.ts";
import { loadRegistry, saveRegistry } from "./registry.ts";
import { log, sh } from "./shell.ts";

const CF_API = "https://api.cloudflare.com/client/v4";
const CLOUDFLARED_HOME = join(homedir(), ".cloudflared");

export type TunnelCreds = {
	AccountTag: string;
	TunnelID: string;
	TunnelSecret: string;
};

function publicUrlsFile(): string {
	return join(agentDir(), "public-urls.txt");
}

function writePublicUrls(origin: string): void {
	mkdirSync(agentDir(), { recursive: true });
	writeFileSync(publicUrlsFile(), `${origin.replace(/\/$/, "")}\n`);
}

function cloudflaredBinary(): string | undefined {
	for (const candidate of [
		"/opt/homebrew/bin/cloudflared",
		"/usr/local/bin/cloudflared",
	]) {
		if (existsSync(candidate)) return candidate;
	}
	const found = sh("bash", ["-lc", "command -v cloudflared"]).stdout.trim();
	return found || undefined;
}

function credentialsPath(worktreeNum: number): string {
	return join(agentDir(), `cf-wt${worktreeNum}.json`);
}

function configPath(worktreeNum: number): string {
	return join(agentDir(), `cf-wt${worktreeNum}.yml`);
}

function pidFile(worktreeNum: number): string {
	return join(agentDir(), `cf-wt${worktreeNum}.pid`);
}

function logPath(worktreeNum: number): string {
	return join(agentDir(), `cf-wt${worktreeNum}.log`);
}

/**
 * Fill missing Cloudflare creds from `~/.autumn-agent/cloudflare.env`.
 * Already-set keys win — `bun dw` is wrapped in `infisical run`, and Cloud
 * start.sh snapshots the token at boot. Overwriting would keep a stale
 * coding-agent token after Infisical is updated mid-session.
 */
export function loadAgentCloudflareEnv({
	env = process.env,
	home,
}: {
	env?: NodeJS.ProcessEnv;
	home?: string;
} = {}): void {
	const path = join(agentDir({ home }), "cloudflare.env");
	if (!existsSync(path)) return;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const m = line.match(
			/^(CLOUDFLARE_TUNNEL_API_TOKEN|CLOUDFLARE_TUNNEL_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=(.*)$/,
		);
		if (!m) continue;
		const [, key, value] = m;
		if (!value || env[key]) continue;
		env[key] = value;
	}
}

function cfToken(): string | undefined {
	loadAgentCloudflareEnv();
	return (
		process.env.CLOUDFLARE_TUNNEL_API_TOKEN ||
		process.env.CLOUDFLARE_API_TOKEN ||
		process.env.CF_API_TOKEN
	);
}

function cfAccountId(): string | undefined {
	loadAgentCloudflareEnv();
	return (
		process.env.CLOUDFLARE_TUNNEL_ACCOUNT_ID ||
		process.env.CLOUDFLARE_ACCOUNT_ID ||
		process.env.CF_ACCOUNT_ID
	);
}

function readLocalCreds(worktreeNum: number): TunnelCreds | undefined {
	const path = credentialsPath(worktreeNum);
	if (!existsSync(path)) return undefined;
	try {
		const data = JSON.parse(readFileSync(path, "utf8")) as TunnelCreds;
		if (data.TunnelID && data.TunnelSecret && data.AccountTag) return data;
	} catch {}
	return undefined;
}

function writeLocalCreds({
	creds,
	worktreeNum,
}: {
	creds: TunnelCreds;
	worktreeNum: number;
}): void {
	const path = credentialsPath(worktreeNum);
	writeFileSync(path, `${JSON.stringify(creds, null, 2)}\n`);
	chmodSync(path, 0o600);
}

function credsFromUnknown(data: unknown): TunnelCreds | undefined {
	if (!data || typeof data !== "object") return undefined;
	const rec = data as Record<string, unknown>;
	const nested =
		rec.credentials_file && typeof rec.credentials_file === "object"
			? (rec.credentials_file as Record<string, unknown>)
			: rec;
	const account = nested.AccountTag ?? rec.account_tag ?? rec.AccountTag;
	const id = nested.TunnelID ?? rec.id ?? rec.TunnelID;
	const secret = nested.TunnelSecret ?? rec.TunnelSecret;
	if (
		typeof account === "string" &&
		typeof id === "string" &&
		typeof secret === "string"
	) {
		return { AccountTag: account, TunnelID: id, TunnelSecret: secret };
	}
	return undefined;
}

function findCredsOnDisk({
	tunnelId,
}: {
	tunnelId: string;
}): TunnelCreds | undefined {
	const dirs = [agentDir(), CLOUDFLARED_HOME];
	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		for (const name of readdirSync(dir)) {
			if (!name.endsWith(".json")) continue;
			try {
				const creds = credsFromUnknown(
					JSON.parse(readFileSync(join(dir, name), "utf8")),
				);
				if (creds?.TunnelID === tunnelId) return creds;
			} catch {}
		}
	}
	return undefined;
}

async function cfFetch({
	body,
	method,
	path,
}: {
	body?: unknown;
	method?: string;
	path: string;
}): Promise<unknown> {
	const token = cfToken();
	if (!token) throw new Error("CLOUDFLARE_TUNNEL_API_TOKEN is not set");
	const response = await fetch(`${CF_API}${path}`, {
		body: body === undefined ? undefined : JSON.stringify(body),
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		method: method ?? "GET",
	});
	const data = (await response.json()) as {
		errors?: { message?: string }[];
		result?: unknown;
		success?: boolean;
	};
	if (!response.ok || data.success === false) {
		const detail = data.errors
			?.map((e) => e.message)
			.filter(Boolean)
			.join("; ");
		const hint =
			response.status === 403 && path.includes("/dns_records")
				? " (Zone DNS permission missing, or stale ~/.autumn-agent/cloudflare.env overriding Infisical)"
				: "";
		throw new Error(
			`cloudflare ${method ?? "GET"} ${path} failed: ${response.status}${detail ? ` ${detail}` : ""}${hint}`,
		);
	}
	return data.result;
}

async function resolveAccountId(): Promise<string> {
	const fromEnv = cfAccountId();
	if (fromEnv) return fromEnv;
	const result = (await cfFetch({ path: "/accounts" })) as {
		id?: string;
	}[];
	if (result.length === 1 && result[0]?.id) return result[0].id;
	throw new Error(
		"CLOUDFLARE_TUNNEL_ACCOUNT_ID is not set and the token sees multiple accounts",
	);
}

async function ensureNamedTunnelApi({
	name,
	worktreeNum,
}: {
	name: string;
	worktreeNum: number;
}): Promise<TunnelCreds> {
	const accountId = await resolveAccountId();
	const listed = (await cfFetch({
		path: `/accounts/${accountId}/cfd_tunnel?name=${encodeURIComponent(name)}&is_deleted=false`,
	})) as { id?: string }[];
	const existingId = listed[0]?.id;
	if (existingId) {
		const onDisk = findCredsOnDisk({ tunnelId: existingId });
		if (onDisk) {
			writeLocalCreds({ creds: onDisk, worktreeNum });
			return onDisk;
		}
		await cfFetch({
			method: "DELETE",
			path: `/accounts/${accountId}/cfd_tunnel/${existingId}`,
		});
		log(`cloudflare tunnel ${name} had no local credentials; recreated`);
	}
	const created = await cfFetch({
		body: { config_src: "local", name },
		method: "POST",
		path: `/accounts/${accountId}/cfd_tunnel`,
	});
	const creds = credsFromUnknown(created);
	if (!creds) {
		throw new Error(`cloudflare create tunnel ${name} returned no credentials`);
	}
	writeLocalCreds({ creds, worktreeNum });
	return creds;
}

function hasCertPem(): boolean {
	return existsSync(join(CLOUDFLARED_HOME, "cert.pem"));
}

function parseTunnelCreate(stdout: string): TunnelCreds | undefined {
	const id = stdout.match(
		/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
	)?.[0];
	if (!id) return undefined;
	const file =
		stdout.match(/\/\S+\/[0-9a-f-]{36}\.json/i)?.[0] ??
		join(CLOUDFLARED_HOME, `${id}.json`);
	if (!existsSync(file)) return undefined;
	return credsFromUnknown(JSON.parse(readFileSync(file, "utf8")));
}

function ensureNamedTunnelCli({
	name,
	worktreeNum,
}: {
	name: string;
	worktreeNum: number;
}): TunnelCreds {
	const bin = cloudflaredBinary();
	if (!bin) throw new Error("cloudflared is not on PATH");
	const created = sh(bin, ["tunnel", "create", name]);
	if (created.code === 0) {
		const creds = parseTunnelCreate(`${created.stdout}\n${created.stderr}`);
		if (creds) {
			writeLocalCreds({ creds, worktreeNum });
			return creds;
		}
	}
	const listed = sh(bin, ["tunnel", "list", "--output", "json"]);
	if (listed.code === 0) {
		try {
			const rows = JSON.parse(listed.stdout) as {
				id?: string;
				name?: string;
			}[];
			const row = rows.find((r) => r.name === name);
			if (row?.id) {
				const creds = findCredsOnDisk({ tunnelId: row.id });
				if (creds) {
					writeLocalCreds({ creds, worktreeNum });
					return creds;
				}
			}
		} catch {}
	}
	throw new Error(
		created.stderr.trim() ||
			`cloudflared tunnel create ${name} failed (exit ${created.code})`,
	);
}

async function renameTunnel({
	creds,
	name,
}: {
	creds: TunnelCreds;
	name: string;
}): Promise<void> {
	if (!cfToken()) return;
	const accountId = await resolveAccountId();
	const current = (await cfFetch({
		path: `/accounts/${accountId}/cfd_tunnel/${creds.TunnelID}`,
	})) as { name?: string };
	if (current.name === name) return;
	await cfFetch({
		body: { name },
		method: "PATCH",
		path: `/accounts/${accountId}/cfd_tunnel/${creds.TunnelID}`,
	});
}

async function ensureNamedTunnel({
	name,
	worktreeNum,
}: {
	name: string;
	worktreeNum: number;
}): Promise<TunnelCreds> {
	const existing = readLocalCreds(worktreeNum);
	if (existing) {
		await renameTunnel({ creds: existing, name });
		return existing;
	}
	if (cfToken()) return ensureNamedTunnelApi({ name, worktreeNum });
	if (hasCertPem()) return ensureNamedTunnelCli({ name, worktreeNum });
	throw new Error(
		"need CLOUDFLARE_TUNNEL_API_TOKEN or `cloudflared tunnel login` (cert.pem)",
	);
}

function dnsRecordName({
	hostname,
	zoneName,
}: {
	hostname: string;
	zoneName: string;
}): string {
	if (hostname === zoneName) return "@";
	if (hostname.endsWith(`.${zoneName}`)) {
		return hostname.slice(0, -(zoneName.length + 1));
	}
	return hostname;
}

async function resolveZone({
	hostname,
}: {
	hostname: string;
}): Promise<{ id: string; name: string }> {
	const suffixes: string[] = [];
	const parts = hostname.split(".");
	for (let i = 1; i < parts.length; i++)
		suffixes.push(parts.slice(i).join("."));
	for (const name of suffixes) {
		const result = (await cfFetch({
			path: `/zones?name=${encodeURIComponent(name)}`,
		})) as { id?: string; name?: string }[];
		if (result[0]?.id && result[0]?.name) {
			return { id: result[0].id, name: result[0].name };
		}
	}
	throw new Error(`no Cloudflare zone found for ${hostname}`);
}

async function deleteDns({ hostname }: { hostname: string }): Promise<void> {
	if (!cfToken() || !hostname.endsWith(`.${PUBLIC_DEV_ZONE}`)) return;
	const zone = await resolveZone({ hostname });
	const existing = (await cfFetch({
		path: `/zones/${zone.id}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
	})) as { id?: string }[];
	if (!existing[0]?.id) return;
	await cfFetch({
		method: "DELETE",
		path: `/zones/${zone.id}/dns_records/${existing[0].id}`,
	});
	log(`cloudflare DNS ${hostname} removed`);
}

async function ensureDnsApi({
	hostname,
	tunnelId,
}: {
	hostname: string;
	tunnelId: string;
}): Promise<void> {
	const zone = await resolveZone({ hostname });
	const recordName = dnsRecordName({ hostname, zoneName: zone.name });
	const target = `${tunnelId}.cfargotunnel.com`;
	const existing = (await cfFetch({
		path: `/zones/${zone.id}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
	})) as { id?: string; content?: string }[];
	if (existing[0]?.id) {
		if (existing[0].content === target) return;
		await cfFetch({
			body: {
				content: target,
				name: recordName,
				proxied: true,
				ttl: 1,
				type: "CNAME",
			},
			method: "PATCH",
			path: `/zones/${zone.id}/dns_records/${existing[0].id}`,
		});
		return;
	}
	await cfFetch({
		body: {
			content: target,
			name: recordName,
			proxied: true,
			ttl: 1,
			type: "CNAME",
		},
		method: "POST",
		path: `/zones/${zone.id}/dns_records`,
	});
}

function ensureDnsCli({
	hostname,
	tunnelId,
}: {
	hostname: string;
	tunnelId: string;
}): void {
	const bin = cloudflaredBinary();
	if (!bin) throw new Error("cloudflared is not on PATH");
	const routed = sh(bin, [
		"tunnel",
		"route",
		"dns",
		"--overwrite-dns",
		tunnelId,
		hostname,
	]);
	if (routed.code !== 0) {
		throw new Error(
			routed.stderr.trim() ||
				`cloudflared tunnel route dns ${hostname} failed (exit ${routed.code})`,
		);
	}
}

async function ensureDns({
	hostname,
	tunnelId,
}: {
	hostname: string;
	tunnelId: string;
}): Promise<void> {
	if (cfToken()) {
		await ensureDnsApi({ hostname, tunnelId });
		return;
	}
	if (hasCertPem()) {
		ensureDnsCli({ hostname, tunnelId });
		return;
	}
	throw new Error("cannot create DNS: no Cloudflare API token or cert.pem");
}

function pidRunning(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function stopPublicAccess({
	worktreeNum,
}: {
	worktreeNum: number;
}): void {
	const file = pidFile(worktreeNum);
	if (!existsSync(file)) return;
	const pid = Number(readFileSync(file, "utf8").trim());
	if (pidRunning(pid)) {
		try {
			process.kill(pid, "SIGTERM");
		} catch {}
	}
	const deadline = Date.now() + 2000;
	while (Date.now() < deadline && pidRunning(pid)) {
		Bun.sleepSync(50);
	}
}

function tunnelServesOrigin(origin: string): boolean {
	const res = Bun.spawnSync([
		"curl",
		"-sS",
		"--max-time",
		"8",
		"--doh-url",
		"https://1.1.1.1/dns-query",
		"-o",
		"/dev/null",
		"-w",
		"%{http_code}",
		origin,
	]);
	if (res.exitCode !== 0) return false;
	const code = new TextDecoder().decode(res.stdout).trim();
	return code !== "" && code !== "000" && code !== "1033";
}

function servicePorts({
	worktreeNum,
}: {
	worktreeNum: number;
}): Record<PublicDevService, number> {
	return {
		api: serverPortFor(worktreeNum),
		checkout: checkoutPortFor(worktreeNum),
		emulate: EMULATE_PORT,
		leaf: leafPortFor(worktreeNum),
		vite: vitePortFor(worktreeNum),
	};
}

function writeConfig({
	creds,
	slug,
	worktreeNum,
}: {
	creds: TunnelCreds;
	slug: string;
	worktreeNum: number;
}): void {
	writeFileSync(
		configPath(worktreeNum),
		renderTunnelConfig({
			credentialsFile: credentialsPath(worktreeNum),
			ingress: publicTunnelIngress({
				ports: servicePorts({ worktreeNum }),
				slug,
			}),
			tunnelId: creds.TunnelID,
		}),
	);
}

function stalePublicHosts({
	nextSlug,
	previousDashboard,
	worktreeNum,
}: {
	nextSlug: string;
	previousDashboard?: string;
	worktreeNum: number;
}): string[] {
	const next = new Set(
		PUBLIC_DEV_SERVICES.map((service) =>
			publicServiceHostname({ slug: nextSlug, service }),
		),
	);
	const stale = [`autumn-wt${worktreeNum}.${PUBLIC_DEV_ZONE}`];
	if (previousDashboard) {
		const prevSlug = dashboardSlug({ hostname: previousDashboard });
		if (prevSlug && prevSlug !== nextSlug) {
			for (const service of PUBLIC_DEV_SERVICES) {
				stale.push(publicServiceHostname({ slug: prevSlug, service }));
			}
		} else if (!prevSlug) {
			stale.push(previousDashboard);
		}
	}
	return [...new Set(stale)].filter((host) => !next.has(host));
}

function startConnector({
	hostname,
	origin,
	worktreeNum,
}: {
	hostname: string;
	origin: string;
	worktreeNum: number;
}): void {
	const bin = cloudflaredBinary();
	if (!bin) throw new Error("cloudflared is not on PATH");
	const file = pidFile(worktreeNum);
	stopPublicAccess({ worktreeNum });
	mkdirSync(agentDir(), { recursive: true });
	const fd = openSync(logPath(worktreeNum), "a");
	const proc = Bun.spawn(
		[
			bin,
			"tunnel",
			"--config",
			configPath(worktreeNum),
			"--no-autoupdate",
			"run",
		],
		{
			cwd: process.cwd(),
			detached: true,
			stdin: "ignore",
			stdout: fd,
			stderr: fd,
		},
	);
	proc.unref();
	if (proc.pid) writeFileSync(file, `${proc.pid}\n`);
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (tunnelServesOrigin(origin)) {
			log(`cloudflare ${origin} → ${hostname}`);
			return;
		}
		Bun.sleepSync(250);
	}
	log(`cloudflare ${origin} did not become healthy`);
}

function persistEntry(entry: RegistryEntry): RegistryEntry {
	const registry = loadRegistry();
	registry[entry.path] = { ...(registry[entry.path] ?? entry), ...entry };
	saveRegistry(registry);
	return entry;
}

export async function ensurePublicAccess(
	entry: RegistryEntry,
	opts: { quiet?: boolean } = {},
): Promise<RegistryEntry> {
	await releaseNgrokIfPresent(entry);

	const hostArgs = {
		machineId: machineId(),
		path: entry.path,
		worktreeNum: entry.worktreeNum,
	};
	const slug = publicTunnelName(hostArgs);
	const urls = publicServiceUrls({ slug });
	const hostname = publicHostname(hostArgs);
	const origin = urls.vite;
	const previousHost = (() => {
		const raw = entryPublicOrigin(entry);
		if (!raw) return undefined;
		try {
			return new URL(raw).host;
		} catch {
			return undefined;
		}
	})();
	const staleHosts = stalePublicHosts({
		nextSlug: slug,
		previousDashboard: previousHost,
		worktreeNum: entry.worktreeNum,
	});
	if (!cloudflaredBinary()) {
		if (!opts.quiet) {
			log("cloudflared is not on PATH; brew install cloudflared");
		}
		return persistEntry({
			...entry,
			cloudflareTunnelId: entry.cloudflareTunnelId,
			ngrokUrl: undefined,
			ngrokViteUrl: undefined,
			publicUrl: entry.publicUrl,
			reservedDomainId: undefined,
			reservedViteDomainId: undefined,
		});
	}

	try {
		const creds = await ensureNamedTunnel({
			name: publicTunnelName(hostArgs),
			worktreeNum: entry.worktreeNum,
		});
		writeConfig({ creds, slug, worktreeNum: entry.worktreeNum });
		for (const row of publicTunnelIngress({
			ports: servicePorts({ worktreeNum: entry.worktreeNum }),
			slug,
		})) {
			await ensureDns({ hostname: row.hostname, tunnelId: creds.TunnelID });
		}
		for (const stale of staleHosts) {
			await deleteDns({ hostname: stale });
		}
		startConnector({ hostname, origin, worktreeNum: entry.worktreeNum });
		writePublicUrls(origin);
		ensureEmulateRunning({ origin: urls.emulate });
		const next = persistEntry({
			...entry,
			cloudflareTunnelId: creds.TunnelID,
			ngrokUrl: undefined,
			ngrokViteUrl: undefined,
			publicUrl: origin,
			reservedDomainId: undefined,
			reservedViteDomainId: undefined,
		});
		if (!opts.quiet) log(`public ${origin}`);
		return next;
	} catch (err) {
		if (!opts.quiet) {
			log(
				`cloudflare public access failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		writePublicUrls(origin);
		ensureEmulateRunning({ origin: urls.emulate });
		return persistEntry({
			...entry,
			ngrokUrl: undefined,
			ngrokViteUrl: undefined,
			publicUrl: origin,
			reservedDomainId: undefined,
			reservedViteDomainId: undefined,
		});
	}
}

export function startPublicAccess(entry: RegistryEntry): void {
	void ensurePublicAccess(entry)
		.then((next) => {
			if (next.databaseUrl) writeEnvLocalFiles(next);
		})
		.catch((err) => {
			log(
				`public access failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		});
}
