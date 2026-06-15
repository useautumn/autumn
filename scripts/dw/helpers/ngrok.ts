import { log } from "./shell.ts";
import { shortHash } from "./registry.ts";

const NGROK_API = "https://api.ngrok.com";

export type ReservedDomain = { id: string; domain: string };

// Domain reservation/deletion is the ngrok *management* API (api.ngrok.com),
// which needs an NGROK_API_KEY — distinct from the agent NGROK_AUTHTOKEN that
// binds to a domain via --url. Both live in Infisical for `bun dw`.
export function ngrokApiAvailable(): boolean {
	return Boolean(process.env.NGROK_API_KEY);
}

// Deterministic per-worktree domain so the public URL is stable across `bun d`
// restarts AND teardown→setup cycles (we re-reserve the same name). The path hash
// matches the one used for branch names, keeping it globally unique-ish.
export function reservedDomainName(worktreeNum: number, path: string): string {
	return `autumn-wt${worktreeNum}-${shortHash(path)}.ngrok.app`;
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

// Find-or-create: reuse the reservation if a prior setup left it behind (e.g.
// teardown didn't run), otherwise reserve it fresh.
export async function ensureReservedDomain(
	worktreeNum: number,
	path: string,
): Promise<ReservedDomain> {
	const name = reservedDomainName(worktreeNum, path);
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
	// 404 = already gone; treat as success so teardown is idempotent.
	if (response.status === 204 || response.status === 404) {
		log(`ngrok reserved domain ${id} released`);
		return;
	}
	log(
		`ngrok delete reserved domain ${id} failed: ${response.status} ${await response.text()}`,
	);
}
