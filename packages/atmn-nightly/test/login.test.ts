/**
 * Login never touches the network here: the OAuth flow and the key-minting call
 * are injected. What is under test is the part v2 got wrong — deciding whether
 * a browser exists by trying to open one, not by looking at `isTTY`.
 */

import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type Authorize,
	type CreateApiKeys,
	type LoginOptions,
	runLogin,
} from "../src/actions/login";
import type { BrowserOpener } from "../src/auth/types/browserOpener";

const AUTHORIZATION_URL =
	"https://api.useautumn.com/api/auth/oauth2/authorize?client_id=cli&state=abc";

const temporaryDirs: string[] = [];

const makeProjectDir = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-login-"));
	temporaryDirs.push(dir);
	return dir;
};

afterEach(() => {
	for (const dir of temporaryDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const authorizeWithFakeTokens: Authorize = async ({ onAuthorizationUrl }) => {
	await onAuthorizationUrl({ url: AUTHORIZATION_URL });
	return { accessToken: "oauth_access_token", tokenType: "Bearer" };
};

const createFakeApiKeys: CreateApiKeys = async () => ({
	sandboxKey: "am_sk_test_new",
	prodKey: "am_sk_live_new",
	orgId: "org_123",
});

const openerThatWorks: BrowserOpener = async () => {
	// Resolving is what "a browser opened" means.
};

const openerThatThrows: BrowserOpener = async () => {
	throw new Error("spawn xdg-open ENOENT");
};

const loginInto = ({
	cwd,
	openBrowser,
}: {
	cwd: string;
	openBrowser: BrowserOpener;
}): Promise<{ output: string; envPath: string }> => {
	let output = "";
	const options: LoginOptions = {
		cwd,
		openBrowser,
		write: (text) => {
			output += text;
		},
		authorize: authorizeWithFakeTokens,
		createApiKeys: createFakeApiKeys,
	};
	return runLogin(options).then((result) => ({
		output,
		envPath: result.envPath,
	}));
};

test("prints the authorization URL even when the browser opens", async () => {
	// Copyable on a machine that is not the one running the CLI.
	const { output } = await loginInto({
		cwd: makeProjectDir(),
		openBrowser: openerThatWorks,
	});

	expect(output).toContain(AUTHORIZATION_URL);
	expect(output).toContain("Opened your browser");
});

test("a throwing opener means headless: the flow prints the URL and continues", async () => {
	const cwd = makeProjectDir();

	const { output, envPath } = await loginInto({
		cwd,
		openBrowser: openerThatThrows,
	});

	expect(output).toContain(AUTHORIZATION_URL);
	expect(output).toContain("No browser could be opened here");
	// Continuing is the point: a failed open is not a failed login.
	expect(envPath).toBe(join(cwd, ".env"));
	expect(readFileSync(envPath, "utf8")).toContain(
		"AUTUMN_SECRET_KEY=am_sk_test_new",
	);
});

test("a TTY does not make the CLI claim a browser opened", async () => {
	const originalIsTTY = process.stdout.isTTY;
	process.stdout.isTTY = true;

	try {
		const { output } = await loginInto({
			cwd: makeProjectDir(),
			openBrowser: openerThatThrows,
		});
		expect(output).toContain("No browser could be opened here");
	} finally {
		process.stdout.isTTY = originalIsTTY;
	}
});

test("no TTY does not make the CLI skip a browser that works", async () => {
	const originalIsTTY = process.stdout.isTTY;
	process.stdout.isTTY = false;

	try {
		const { output } = await loginInto({
			cwd: makeProjectDir(),
			openBrowser: openerThatWorks,
		});
		expect(output).toContain("Opened your browser");
	} finally {
		process.stdout.isTTY = originalIsTTY;
	}
});

test("keys go into the existing env file, leaving the rest of it alone", async () => {
	const cwd = makeProjectDir();
	writeFileSync(join(cwd, ".env"), "DATABASE_URL=postgres://local\n");

	const { envPath } = await loginInto({ cwd, openBrowser: openerThatWorks });

	expect(readFileSync(envPath, "utf8")).toBe(
		[
			"DATABASE_URL=postgres://local",
			"AUTUMN_SECRET_KEY=am_sk_test_new",
			"AUTUMN_PROD_SECRET_KEY=am_sk_live_new",
			"",
		].join("\n"),
	);
});

test("a login that mints no keys fails loudly rather than writing nothing", async () => {
	const attempt = runLogin({
		cwd: makeProjectDir(),
		openBrowser: openerThatWorks,
		write: () => {},
		authorize: authorizeWithFakeTokens,
		createApiKeys: async () => ({ orgId: "org_123" }),
	});

	await expect(attempt).rejects.toThrow(/no API keys/);
});
