/**
 * Keyless onboarding: `login --keyless` provisions an org and writes its key;
 * `login --claim` returns and emails one secure browser link.
 */

import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import chalk from "chalk";
import {
	type KeylessDeps,
	projectNameFor,
	runClaim,
	runKeylessLogin,
} from "../src/actions/login/keyless";
import { slugFor } from "../src/auth/keyless";
import { createPrompter } from "../src/prompt/prompt";

chalk.level = 0;

const capture = () => {
	const lines: string[] = [];
	return { lines, write: (text: string) => lines.push(text) };
};

const deps = () => {
	const calls = {
		provision: [] as { name: string; slug: string }[],
		startClaim: [] as { secretKey: string; email: string }[],
	};
	const fake: KeylessDeps = {
		provision: async (params) => {
			calls.provision.push(params);
			return {
				organizationId: "org_k",
				organizationSlug: params.slug,
				apiKey: "am_sk_test_keyless",
				claimToken: "tok",
				claimExpiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
			};
		},
		startClaim: async (params) => {
			calls.startClaim.push(params);
			return {
				claimUrl: "https://app.useautumn.com/claim?token=attempt",
				expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
			};
		},
	};
	return { deps: fake, calls };
};

test("slugFor lowercases, strips the scope, joins with dashes and stays under the cap", () => {
	expect(slugFor("@acme/Billing App")).toBe("billing-app");
	expect(slugFor("  ")).toBe("autumn");
	// The server refuses more than 100 characters, and a trailing dash.
	const long = slugFor(`${"a".repeat(99)} tail`);
	expect(long).toHaveLength(99);
	expect(long.endsWith("-")).toBe(false);
});

test("projectNameFor prefers the root package name, else the folder", () => {
	const root = mkdtempSync(join(tmpdir(), "keyless-"));
	expect(projectNameFor({ repoRoot: root })).toBe(basename(root));
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({ name: "@acme/web" }),
	);
	expect(projectNameFor({ repoRoot: root })).toBe("@acme/web");
});

test("keyless login writes the key, names the org after the project, hides the URL headless", async () => {
	const root = mkdtempSync(join(tmpdir(), "keyless-"));
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({ name: "acme-web" }),
	);
	const { deps: d, calls } = deps();
	const { lines, write } = capture();
	delete process.env.AUTUMN_SECRET_KEY;

	const result = await runKeylessLogin({
		repoRoot: root,
		envDirs: [root],
		deps: d,
		prompter: createPrompter({ interactive: false, write }),
	});

	expect(calls.provision).toEqual([{ name: "acme-web", slug: "acme-web" }]);
	expect(result.orgSlug).toBe("acme-web");
	expect(readFileSync(join(root, ".env"), "utf8")).toContain(
		"AUTUMN_SECRET_KEY=am_sk_test_keyless",
	);
	expect(process.env).toMatchObject({
		AUTUMN_SECRET_KEY: "am_sk_test_keyless",
	});
	const text = lines.join("");
	expect(text).toContain("✓ Created sandbox org acme-web (keyless)");
	expect(text).toContain("Link it within 14 days: atmn login --claim");
	expect(text).not.toContain("https://app.useautumn.com/claim");
});

test("claim returns and emails the same secure browser link", async () => {
	const { deps: d, calls } = deps();
	const output = capture();
	const started = await runClaim({
		secretKey: "am_sk_test_keyless",
		email: "you@example.com",
		deps: d,
		prompter: createPrompter({ interactive: false, write: output.write }),
	});
	expect(calls.startClaim).toEqual([
		{ secretKey: "am_sk_test_keyless", email: "you@example.com" },
	]);
	expect(started.claimUrl).toContain("/claim?token=attempt");
	const text = output.lines.join("");
	expect(text).toContain("✓ Created a claim link for you@example.com");
	expect(text).toContain("https://app.useautumn.com/claim?token=attempt");
	expect(text).toContain("The same link was emailed to you@example.com");
});
