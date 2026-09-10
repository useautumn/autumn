/**
 * Keyless onboarding, end to end: the real CLI in a fresh process, headless,
 * against the real server. An agent with no account gets an org and a key,
 * and links it to an account later with a code sent by email.
 *
 * Contract:
 *   K1  init with no key prints the two ways in (--login / --keyless), writes
 *       nothing, and exits 0
 *   K2  login --keyless creates a sandbox org named after the package, writes
 *       AUTUMN_SECRET_KEY, and never prints the claim URL headless
 *   K3  env reports the org as unclaimed, in the table and in --json
 *   K4  login --claim <email> sends a code and hints --otp; a second run with
 *       --otp links the org, and env then reports it claimed
 *   K5  init --keyless does K2 and then carries on: config, pull, skills
 */

import { afterAll, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { organizations, verification } from "@autumn/shared";
import { CLI_PACKAGE_DIR } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import chalk from "chalk";
import { eq, like } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";

const { db } = initDrizzle();
const CLI_ENTRY = join(CLI_PACKAGE_DIR, "src/cli.ts");
const baseUrl = process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080";

const createdOrgIds: string[] = [];
afterAll(async () => {
	for (const id of createdOrgIds)
		await db
			.delete(organizations)
			.where(eq(organizations.id, id))
			.catch(() => {});
});

const runCliHeadless = ({
	cwd,
	args,
}: {
	cwd: string;
	args: string[];
}): { output: string; exitCode: number } => {
	const result = Bun.spawnSync(["bun", CLI_ENTRY, "--headless", ...args], {
		cwd,
		env: {
			PATH: process.env.PATH ?? "",
			HOME: process.env.HOME ?? "",
			AUTUMN_BASE_URL: baseUrl,
			ATMN_INIT_DEPENDENCY: `file:${CLI_PACKAGE_DIR}`,
			NO_COLOR: "1",
			FORCE_COLOR: "0",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
		exitCode: result.exitCode,
	};
};

const makeRepo = ({ name }: { name: string }): string => {
	const root = mkdtempSync(join(tmpdir(), "atmn-keyless-"));
	Bun.spawnSync(["git", "init", "-q"], { cwd: root });
	writeFileSync(join(root, "package.json"), JSON.stringify({ name }));
	return root;
};

const envValue = ({ cwd, key }: { cwd: string; key: string }) =>
	readFileSync(join(cwd, ".env"), "utf8")
		.split("\n")
		.find((line) => line.startsWith(`${key}=`))
		?.slice(key.length + 1);

/** The code the server emailed: better-auth stores it plain as `<otp>:<attempts>`. */
const otpSentTo = async ({ email }: { email: string }): Promise<string> => {
	const [row] = await db
		.select({ value: verification.value })
		.from(verification)
		.where(like(verification.identifier, `sign-in-otp-${email}`))
		.limit(1);
	if (!row) throw new Error(`No OTP stored for ${email}`);
	return row.value.slice(0, row.value.lastIndexOf(":"));
};

const uniqueEmail = () =>
	`keyless-${crypto.randomUUID().slice(0, 8)}@example.com`;

test(`${chalk.yellowBright("atmn keyless: init hints, login --keyless provisions, login --claim links")}`, async () => {
	const root = makeRepo({ name: "keyless-app" });
	try {
		// K1
		const asked = runCliHeadless({ cwd: root, args: ["init"] });
		expect(asked.exitCode).toBe(0);
		expect(asked.output).toContain("→ How do you want to connect to Autumn?");
		expect(asked.output).toContain("--login    ");
		expect(asked.output).toContain("--keyless  ");
		expect(existsSync(join(root, ".env"))).toBe(false);
		expect(existsSync(join(root, "autumn.config.ts"))).toBe(false);

		// K2
		const keyless = runCliHeadless({ cwd: root, args: ["login", "--keyless"] });
		expect(keyless.exitCode).toBe(0);
		expect(keyless.output).toContain("✓ Created sandbox org keyless-app");
		expect(keyless.output).toContain("atmn login --claim");
		expect(keyless.output).not.toContain("/claim?");
		const key = envValue({ cwd: root, key: "AUTUMN_SECRET_KEY" });
		expect(key).toMatch(/^am_sk_test_/);

		// K3
		const env = JSON.parse(
			runCliHeadless({ cwd: root, args: ["env", "--json"] }).output,
		);
		createdOrgIds.push(env.organization.id);
		expect(env.claimed).toBe(false);
		expect(typeof env.claimExpiresAt).toBe("string");
		expect(env.notes.join("\n")).toContain("atmn login --claim <email>");
		expect(runCliHeadless({ cwd: root, args: ["env"] }).output).toContain(
			"Owner         unclaimed",
		);

		// K4
		const email = uniqueEmail();
		const sent = runCliHeadless({
			cwd: root,
			args: ["login", "--claim", email],
		});
		expect(sent.exitCode).toBe(0);
		expect(sent.output).toContain(`✓ Sent a one-time code to ${email}`);
		expect(sent.output).toContain(`atmn login --claim ${email} --otp`);

		const otp = await otpSentTo({ email });
		const linked = runCliHeadless({
			cwd: root,
			args: ["login", "--claim", email, "--otp", otp],
		});
		expect(linked.exitCode).toBe(0);
		expect(linked.output).toContain(`✓ Linked keyless-app to ${email}`);

		const after = JSON.parse(
			runCliHeadless({ cwd: root, args: ["env", "--json"] }).output,
		);
		expect(after.claimed).toBe(true);
		expect(after.claimExpiresAt).toBeNull();
		expect(runCliHeadless({ cwd: root, args: ["env"] }).output).not.toContain(
			"unclaimed",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test(`${chalk.yellowBright("atmn init --keyless: provisions, then sets the repo up")}`, async () => {
	const root = makeRepo({ name: "keyless-init" });
	try {
		const init = runCliHeadless({ cwd: root, args: ["init", "--keyless"] });
		expect(init.exitCode).toBe(0);
		expect(init.output).toContain("✓ Created sandbox org keyless-init");
		expect(envValue({ cwd: root, key: "AUTUMN_SECRET_KEY" })).toMatch(
			/^am_sk_test_/,
		);
		expect(existsSync(join(root, "autumn.config.ts"))).toBe(true);
		expect(existsSync(join(root, "skills/autumn-setup/SKILL.md"))).toBe(true);

		const env = JSON.parse(
			runCliHeadless({ cwd: root, args: ["env", "--json"] }).output,
		);
		createdOrgIds.push(env.organization.id);
		expect(env.claimed).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
