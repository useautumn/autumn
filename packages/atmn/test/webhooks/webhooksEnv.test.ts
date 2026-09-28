/**
 * Which `url` key a command reads, and where a new webhook's secret lands.
 * `-p` is `live` and the default sandbox is `sandbox`, with no lookup; a named
 * sandbox is its slug, from one `/organization/me`. Prod secrets go to
 * `.env.prod`; sandbox secrets carry the org's first four id characters and
 * follow atmn's `.env.local` → `.env` precedence.
 */

import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { OrgInfo } from "../../src/actions/env/types/orgInfo";
import { webhookPullEnvs } from "../../src/actions/pull/webhooks/webhookPullEnvs";
import { resolveWebhooksForEnv } from "../../src/actions/webhooks/resolveWebhooksForEnv";
import { webhookSecretName } from "../../src/actions/webhooks/webhookSecretName";
import { writeWebhookSecrets } from "../../src/actions/webhooks/writeWebhookSecrets";

const orgInfo = (overrides: Partial<OrgInfo> = {}): OrgInfo => ({
	id: "org_ab12cd34",
	name: "Acme",
	slug: "acme",
	env: "sandbox",
	...overrides,
});

const countingFetch = (info: OrgInfo) => {
	const calls = { count: 0 };
	return {
		calls,
		fetchOrgInfo: async () => {
			calls.count += 1;
			return info;
		},
	};
};

const listWebhooks = async () => ({ list: [] });

test("-p reads url.live and the default sandbox reads url.sandbox, neither looking anything up", async () => {
	const { calls, fetchOrgInfo } = countingFetch(orgInfo());
	const [live] = webhookPullEnvs({
		env: { AUTUMN_PROD_SECRET_KEY: "sk_live" },
		targetKeyName: "AUTUMN_PROD_SECRET_KEY",
		listWebhooks,
		fetchOrgInfo,
	});
	const [sandbox] = webhookPullEnvs({
		env: { AUTUMN_SECRET_KEY: "sk_sandbox" },
		targetKeyName: "AUTUMN_SECRET_KEY",
		listWebhooks,
		fetchOrgInfo,
	});
	expect(await live?.envKey()).toBe("live");
	expect(await sandbox?.envKey()).toBe("sandbox");
	expect(calls.count).toBe(0);
});

test("a named sandbox reads its slug, from one lookup of its own org", async () => {
	const { calls, fetchOrgInfo } = countingFetch(
		orgInfo({ id: "org_qa99xyz", name: "QA-Team", is_sandbox: true }),
	);
	const [env] = webhookPullEnvs({
		env: { AUTUMN_SANDBOX_ORG_QA99XYZ_SECRET_KEY: "sk_qa" },
		targetKeyName: "AUTUMN_SANDBOX_ORG_QA99XYZ_SECRET_KEY",
		listWebhooks,
		fetchOrgInfo,
	});
	expect(await env?.envKey()).toBe("qa-team");
	expect(calls.count).toBe(1);
});

test("each env is sent only its own entries, without the env field", () => {
	const webhooks = resolveWebhooksForEnv({
		rows: [
			{ id: "billing", env: "live", url: "https://a.dev/h" },
			{
				id: "billing",
				env: "sandbox",
				url: "https://s.dev/h",
				events: ["billing.updated"],
			},
			{ id: "prod-only", env: "live", url: "https://a.dev/p" },
		],
		envKey: "sandbox",
	});
	expect(webhooks).toEqual([
		{ id: "billing", url: "https://s.dev/h", events: ["billing.updated"] },
	]);
});

test("secret names: prod has no suffix; a sandbox adds its slug, every non-alphanumeric run as _", () => {
	expect(webhookSecretName({ id: "billing" })).toBe(
		"AUTUMN_WEBHOOK_BILLING_SECRET",
	);
	expect(webhookSecretName({ id: "billing-v2", envKey: "sandbox" })).toBe(
		"AUTUMN_WEBHOOK_BILLING_V2_SANDBOX_SECRET",
	);
	expect(webhookSecretName({ id: "billing", envKey: "qa-team" })).toBe(
		"AUTUMN_WEBHOOK_BILLING_QA_TEAM_SECRET",
	);
	expect(webhookSecretName({ id: "billing", envKey: "qa--team.é" })).toBe(
		"AUTUMN_WEBHOOK_BILLING_QA_TEAM__SECRET",
	);
});

const envDir = (name: string): string => {
	const dir = join(import.meta.dir, ".tmp", name);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	return dir;
};

test("prod secrets go to .env.prod and never touch .env.local", async () => {
	const dir = envDir("prod");
	writeFileSync(join(dir, ".env.local"), "AUTUMN_SECRET_KEY=sk_test\n");
	const lines = await writeWebhookSecrets({
		secrets: [{ id: "billing", secret: "whsec_live" }],
		env: { key: "live", live: true },
		envDirs: [dir],
		cwd: dir,
	});
	expect(readFileSync(join(dir, ".env.prod"), "utf8")).toBe(
		"AUTUMN_WEBHOOK_BILLING_SECRET=whsec_live\n",
	);
	expect(statSync(join(dir, ".env.prod")).mode & 0o777).toBe(0o600);
	expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe(
		"AUTUMN_SECRET_KEY=sk_test\n",
	);
	expect(lines).toEqual([
		"Saved webhook secret as AUTUMN_WEBHOOK_BILLING_SECRET in .env.prod",
	]);
});

test("sandbox secrets follow .env.local over .env, and the log names variable and file", async () => {
	const dir = envDir("sandbox");
	writeFileSync(join(dir, ".env"), "A=1\n");
	writeFileSync(join(dir, ".env.local"), "B=2\n");
	const lines = await writeWebhookSecrets({
		secrets: [{ id: "billing", secret: "whsec_sb" }],
		env: { key: "sandbox", live: false },
		envDirs: [dir],
		cwd: dir,
	});
	expect(readFileSync(join(dir, ".env.local"), "utf8")).toBe(
		"B=2\nAUTUMN_WEBHOOK_BILLING_SANDBOX_SECRET=whsec_sb\n",
	);
	expect(readFileSync(join(dir, ".env"), "utf8")).toBe("A=1\n");
	expect(existsSync(join(dir, ".env.prod"))).toBe(false);
	expect(lines).toEqual([
		"Saved webhook secret as AUTUMN_WEBHOOK_BILLING_SANDBOX_SECRET in .env.local",
	]);
});
