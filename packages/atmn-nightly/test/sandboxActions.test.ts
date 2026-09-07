/**
 * The three sandbox commands, with the API faked and a real `.env` on disk.
 * What matters here is what the user reads and what the file ends up holding:
 * the key is shown once, so losing it or scrubbing the wrong line is not
 * recoverable.
 */

import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { runSandboxCreate } from "../src/actions/sandbox/createSandbox";
import { runSandboxDelete } from "../src/actions/sandbox/deleteSandbox";
import { runSandboxList } from "../src/actions/sandbox/listSandboxes";
import type { SandboxClient } from "../src/actions/sandbox/types/sandboxClient";
import {
	SANDBOX_LOGIN_HINT,
	withSandboxScopeHint,
} from "../src/actions/sandbox/withSandboxScopeHint";
import { AutumnApiError } from "../src/generated/client";
import type { SandboxRow } from "../src/render/renderSandboxes";

chalk.level = 0;

const DAY = 24 * 60 * 60 * 1000;

const temporaryDirs: string[] = [];

const makeProjectDir = ({ env }: { env?: string } = {}): string => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-sandbox-"));
	temporaryDirs.push(dir);
	if (env !== undefined) writeFileSync(join(dir, ".env"), env);
	return dir;
};

afterEach(() => {
	for (const dir of temporaryDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const envText = ({ dir }: { dir: string }): string =>
	readFileSync(join(dir, ".env"), "utf8");

const sandbox = ({
	id,
	name,
	ageInDays = 0,
}: {
	id: string;
	name: string;
	ageInDays?: number;
}): SandboxRow => ({
	id,
	name,
	slug: `${name}-abc123|org_root`,
	createdAt: Date.now() - ageInDays * DAY,
	color: "gray",
	icon: "Flask",
});

type Calls = {
	created: unknown[];
	deleted: unknown[];
};

const fakeClient = ({
	list = [],
	calls = { created: [], deleted: [] },
}: {
	list?: SandboxRow[];
	calls?: Calls;
} = {}): SandboxClient => ({
	listSandboxes: async () => ({ list }),
	createSandbox: async (body) => {
		calls.created.push(body);
		return {
			...sandbox({ id: "org_2n4b", name: body.name }),
			color: body.color ?? "gray",
			icon: body.icon ?? "Flask",
			secretKey: "am_sk_test_minted",
		};
	},
	deleteSandbox: async (body) => {
		calls.deleted.push(body);
		return { success: true };
	},
});

const capture = (): { write: (text: string) => void; text: () => string } => {
	const chunks: string[] = [];
	return {
		write: (text) => {
			chunks.push(text);
		},
		text: () => chunks.join(""),
	};
};

test("list shows every sandbox, and marks the one commands target", async () => {
	const output = capture();

	await runSandboxList({
		client: fakeClient({
			list: [
				sandbox({ id: "org_9x2k", name: "demo", ageInDays: 5 }),
				sandbox({ id: "org_2n4b", name: "staging", ageInDays: 2 }),
			],
		}),
		currentSandboxId: "org_2n4b",
		write: output.write,
	});

	const lines = output.text().trimEnd().split("\n");
	expect(lines[0]).toBe("ID        NAME     CREATED");
	expect(lines[1]).toBe("org_9x2k  demo     5d ago");
	expect(lines[2]).toBe("org_2n4b  staging  2d ago   ← current");
});

test("list with nothing to show says how to make one", async () => {
	const output = capture();

	await runSandboxList({ client: fakeClient(), write: output.write });

	expect(output.text()).toBe(
		"No sandboxes yet. Create one with atmn sandbox create <name>.\n",
	);
});

test("list --json prints the response and nothing else", async () => {
	const output = capture();
	const list = [sandbox({ id: "org_9x2k", name: "demo" })];

	await runSandboxList({
		client: fakeClient({ list }),
		currentSandboxId: "org_9x2k",
		json: true,
		write: output.write,
	});

	expect(JSON.parse(output.text())).toEqual({ list });
	expect(output.text()).not.toContain("current");
});

test("create saves the key under the sandbox's own variable", async () => {
	const dir = makeProjectDir({ env: "AUTUMN_SECRET_KEY=am_sk_test_org\n" });
	const output = capture();
	const calls: Calls = { created: [], deleted: [] };

	const result = await runSandboxCreate({
		client: fakeClient({ calls }),
		name: "staging",
		color: "blue",
		envDirs: [dir],
		write: output.write,
	});

	expect(calls.created).toEqual([{ name: "staging", color: "blue" }]);
	expect(result.keyName).toBe("AUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY");
	expect(output.text()).toBe(
		`Created sandbox staging (org_2n4b).\nSaved its key to ${join(dir, ".env")} as AUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY.\n`,
	);
	expect(envText({ dir })).toBe(
		"AUTUMN_SECRET_KEY=am_sk_test_org\nAUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY=am_sk_test_minted\n",
	);
});

test("create --use pins the sandbox as well", async () => {
	const dir = makeProjectDir({ env: "AUTUMN_SECRET_KEY=am_sk_test_org\n" });
	const output = capture();

	await runSandboxCreate({
		client: fakeClient(),
		name: "staging",
		use: true,
		envDirs: [dir],
		write: output.write,
	});

	expect(output.text()).toContain(
		"Pinned AUTUMN_SANDBOX_ID=org_2n4b; every command targets it until you change it.\n",
	);
	expect(envText({ dir })).toContain("AUTUMN_SANDBOX_ID=org_2n4b\n");
});

test("create --json still writes the key, and prints only the response", async () => {
	const dir = makeProjectDir({ env: "" });
	const output = capture();

	await runSandboxCreate({
		client: fakeClient(),
		name: "staging",
		json: true,
		envDirs: [dir],
		write: output.write,
	});

	expect(JSON.parse(output.text()).secretKey).toBe("am_sk_test_minted");
	expect(output.text()).not.toContain("Created sandbox");
	expect(envText({ dir })).toContain(
		"AUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY=am_sk_test_minted\n",
	);
});

test("delete without --yes says what would go and sends nothing", async () => {
	const dir = makeProjectDir({
		env: "AUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY=am_sk_test_minted\n",
	});
	const output = capture();
	const calls: Calls = { created: [], deleted: [] };

	const result = await runSandboxDelete({
		client: fakeClient({
			list: [sandbox({ id: "org_2n4b", name: "staging" })],
			calls,
		}),
		id: "org_2n4b",
		envDirs: [dir],
		write: output.write,
	});

	expect(result.deleted).toBe(false);
	expect(calls.deleted).toEqual([]);
	expect(output.text()).toBe(
		"This deletes sandbox staging (org_2n4b) and everything in it. Re-run with --yes to delete.\n",
	);
	expect(envText({ dir })).toContain("AUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY=");
});

test("delete --yes removes the sandbox, its key and the pin that named it", async () => {
	const dir = makeProjectDir({
		env: "AUTUMN_SECRET_KEY=am_sk_test_org\nAUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY=am_sk_test_minted\nAUTUMN_SANDBOX_ID=org_2n4b\n",
	});
	const output = capture();
	const calls: Calls = { created: [], deleted: [] };

	await runSandboxDelete({
		client: fakeClient({
			list: [sandbox({ id: "org_2n4b", name: "staging" })],
			calls,
		}),
		id: "org_2n4b",
		yes: true,
		envDirs: [dir],
		write: output.write,
	});

	expect(calls.deleted).toEqual([{ id: "org_2n4b" }]);
	expect(output.text()).toBe(
		`Deleted sandbox staging (org_2n4b).\nDropped its key from ${join(dir, ".env")}.\n`,
	);
	expect(envText({ dir })).toBe("AUTUMN_SECRET_KEY=am_sk_test_org\n");
});

test("create shows the key once when the .env cannot be written", async () => {
	// A directory where the .env should be makes the write fail after minting.
	const dir = makeProjectDir();
	mkdirSync(join(dir, ".env"));
	const output = capture();

	await expect(
		runSandboxCreate({
			client: fakeClient(),
			name: "staging",
			envDirs: [dir],
			write: output.write,
		}),
	).rejects.toThrow();
	expect(output.text()).toBe(
		"Could not write your .env. Save this key yourself:\nAUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY=am_sk_test_minted\n",
	);
});

test("a scope refusal from the server becomes a login hint", () => {
	const refused = new AutumnApiError({
		status: 403,
		path: "/v1/sandboxes.create",
		body: { message: "Insufficient scopes. Missing: platform:write" },
	});
	const hinted = withSandboxScopeHint({ error: refused });
	expect(hinted).toBeInstanceOf(Error);
	expect((hinted as Error).message).toBe(SANDBOX_LOGIN_HINT);

	const other = new Error("boom");
	expect(withSandboxScopeHint({ error: other })).toBe(other);
});

test("delete leaves a pin that points at a different sandbox alone", async () => {
	const dir = makeProjectDir({
		env: "AUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY=am_sk_test_minted\nAUTUMN_SANDBOX_ID=org_other\n",
	});

	await runSandboxDelete({
		client: fakeClient({
			list: [sandbox({ id: "org_2n4b", name: "staging" })],
		}),
		id: "org_2n4b",
		yes: true,
		envDirs: [dir],
		write: () => undefined,
	});

	expect(envText({ dir })).toBe("AUTUMN_SANDBOX_ID=org_other\n");
});

test("an id no sandbox has is an error, not a request", async () => {
	const dir = makeProjectDir({ env: "" });
	const calls: Calls = { created: [], deleted: [] };

	await expect(
		runSandboxDelete({
			client: fakeClient({
				list: [sandbox({ id: "org_2n4b", name: "staging" })],
				calls,
			}),
			id: "org_typo",
			yes: true,
			envDirs: [dir],
			write: () => undefined,
		}),
	).rejects.toThrow("No sandbox with id org_typo. Run atmn sandbox list.");
	expect(calls.deleted).toEqual([]);
});
