import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentCloudflareEnv } from "./cloudflare.ts";

const homes: string[] = [];

afterEach(async () => {
	await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true })));
});

function writeCloudflareEnv(
	home: string,
	vars: Record<string, string>,
): void {
	const dir = join(home, ".autumn-agent");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "cloudflare.env"),
		`${Object.entries(vars)
			.map(([k, v]) => `${k}=${v}`)
			.join("\n")}\n`,
	);
}

describe("loadAgentCloudflareEnv", () => {
	test("fills token from cloudflare.env when unset", async () => {
		const home = await mkdtemp(join(tmpdir(), "dw-cf-fill-"));
		homes.push(home);
		writeCloudflareEnv(home, {
			CLOUDFLARE_TUNNEL_API_TOKEN: "cfat_from_file",
			CLOUDFLARE_TUNNEL_ACCOUNT_ID: "account_from_file",
		});
		const env: NodeJS.ProcessEnv = {};
		loadAgentCloudflareEnv({ env, home });
		expect(env.CLOUDFLARE_TUNNEL_API_TOKEN).toBe("cfat_from_file");
		expect(env.CLOUDFLARE_TUNNEL_ACCOUNT_ID).toBe("account_from_file");
	});

	test("does not overwrite Infisical/process env with a stale snapshot", async () => {
		const home = await mkdtemp(join(tmpdir(), "dw-cf-keep-"));
		homes.push(home);
		writeCloudflareEnv(home, {
			CLOUDFLARE_TUNNEL_API_TOKEN: "cfat_stale_coding_agent",
			CLOUDFLARE_TUNNEL_ACCOUNT_ID: "stale_account",
		});
		const env: NodeJS.ProcessEnv = {
			CLOUDFLARE_TUNNEL_API_TOKEN: "cfat_infisical_autumn_dw",
			CLOUDFLARE_TUNNEL_ACCOUNT_ID: "infisical_account",
		};
		loadAgentCloudflareEnv({ env, home });
		expect(env.CLOUDFLARE_TUNNEL_API_TOKEN).toBe("cfat_infisical_autumn_dw");
		expect(env.CLOUDFLARE_TUNNEL_ACCOUNT_ID).toBe("infisical_account");
	});
});
