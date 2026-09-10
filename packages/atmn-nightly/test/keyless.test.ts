/**
 * Keyless onboarding: `login --keyless` provisions an org and writes its key;
 * `login --claim` sends a code and verifies it, headless in two runs.
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
import { createPrompter, NeedsInputError } from "../src/prompt/prompt";

chalk.level = 0;

const capture = () => {
	const lines: string[] = [];
	return { lines, write: (text: string) => lines.push(text) };
};

const deps = () => {
	const calls = {
		provision: [] as { name: string; slug: string }[],
		startClaim: [] as { secretKey: string; email: string }[],
		verify: [] as { email: string; otp: string }[],
	};
	const fake: KeylessDeps = {
		provision: async (params) => {
			calls.provision.push(params);
			return {
				organizationId: "org_k",
				organizationSlug: params.slug,
				apiKey: "am_sk_test_keyless",
				claimToken: "tok",
				claimUrl: "https://app.useautumn.com/claim?token=tok",
				claimExpiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
			};
		},
		startClaim: async (params) => {
			calls.startClaim.push(params);
			return { expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
		},
		verifyClaim: async (params) => {
			calls.verify.push(params);
			if (params.otp !== "123456") throw new Error("Invalid code");
			return {
				organizationId: "org_k",
				organizationSlug: "acme",
				userId: "user_1",
				email: params.email,
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

test("keyless login interactive also prints the claim URL", async () => {
	const root = mkdtempSync(join(tmpdir(), "keyless-"));
	const { deps: d } = deps();
	const { lines, write } = capture();
	await runKeylessLogin({
		repoRoot: root,
		envDirs: [root],
		deps: d,
		prompter: createPrompter({ interactive: true, write }),
	});
	expect(lines.join("")).toContain(
		"Or open https://app.useautumn.com/claim?token=tok",
	);
});

test("claim headless: sends the code, hints --otp and stops; second run verifies", async () => {
	const { deps: d, calls } = deps();
	const first = capture();
	await expect(
		runClaim({
			secretKey: "am_sk_test_keyless",
			email: "you@example.com",
			deps: d,
			prompter: createPrompter({ interactive: false, write: first.write }),
		}),
	).rejects.toThrow(NeedsInputError);
	expect(calls.startClaim).toEqual([
		{ secretKey: "am_sk_test_keyless", email: "you@example.com" },
	]);
	expect(calls.verify).toEqual([]);
	const text = first.lines.join("");
	expect(text).toContain("✓ Sent a one-time code to you@example.com");
	expect(text).toContain("atmn login --claim you@example.com --otp 123456");

	const second = capture();
	const verified = await runClaim({
		secretKey: "am_sk_test_keyless",
		email: "you@example.com",
		otp: "123456",
		deps: d,
		prompter: createPrompter({ interactive: false, write: second.write }),
	});
	// --otp skips a fresh code: a second one would invalidate the first.
	expect(calls.startClaim).toHaveLength(1);
	expect(verified.email).toBe("you@example.com");
	expect(second.lines.join("")).toContain("✓ Linked acme to you@example.com");
});

test("claim interactive: asks for the code after sending it", async () => {
	const { deps: d, calls } = deps();
	const { write } = capture();
	await runClaim({
		secretKey: "am_sk_test_keyless",
		email: "you@example.com",
		deps: d,
		prompter: createPrompter({
			interactive: true,
			write,
			readLine: async () => "123456",
		}),
	});
	expect(calls.verify).toEqual([{ email: "you@example.com", otp: "123456" }]);
});
