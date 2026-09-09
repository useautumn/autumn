/**
 * `atmn reset` — the gate and the refusals. The wipe cannot be undone, so what
 * matters is that nothing is sent unless asked for, and that a live key is
 * refused here rather than on the way back from the server.
 */

import { afterEach, expect, test } from "bun:test";
import { type ResetClient, runReset } from "../src/actions/reset/runReset";
import { SANDBOX_ONLY_REFUSAL } from "../src/env/assertSandboxTarget";
import type { Target } from "../src/env/resolveTarget";
import { sandboxKeyName } from "../src/env/sandboxKeyName";

const SANDBOX_ID = "org_2n4b";
const SANDBOX_KEY_NAME = sandboxKeyName({ sandboxId: SANDBOX_ID });

const setKeys: string[] = [];

const setKey = ({ name, value }: { name: string; value: string }): void => {
	setKeys.push(name);
	process.env[name] = value;
};

afterEach(() => {
	for (const name of setKeys.splice(0)) delete process.env[name];
});

const defaultTarget: Target = {
	secretKeyName: "AUTUMN_SECRET_KEY",
	clientId: "cli",
};

const pinnedTarget: Target = {
	secretKeyName: SANDBOX_KEY_NAME,
	clientId: "cli",
	sandboxId: SANDBOX_ID,
};

const prodTarget: Target = {
	secretKeyName: "AUTUMN_PROD_SECRET_KEY",
	clientId: "cli",
};

const fakeClient = ({ calls }: { calls: unknown[] }): ResetClient => ({
	resetSandbox: async (body) => {
		calls.push(body);
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

test("without --yes it says what goes and sends nothing", async () => {
	setKey({ name: "AUTUMN_SECRET_KEY", value: "am_sk_test_org" });
	const output = capture();
	const calls: unknown[] = [];

	const result = await runReset({
		client: fakeClient({ calls }),
		target: defaultTarget,
		write: output.write,
	});

	expect(result.wiped).toBe(false);
	expect(calls).toEqual([]);
	expect(output.text()).toBe(
		"This wipes your main sandbox: every customer, plan, feature and migration draft. Keys and settings stay. Re-run with --yes to wipe.\n",
	);
});

test("--yes wipes the pinned sandbox, and names it", async () => {
	setKey({ name: SANDBOX_KEY_NAME, value: "am_sk_test_minted" });
	const output = capture();
	const calls: unknown[] = [];

	const result = await runReset({
		client: fakeClient({ calls }),
		target: pinnedTarget,
		yes: true,
		write: output.write,
	});

	expect(result.wiped).toBe(true);
	expect(calls).toEqual([{}]);
	expect(output.text()).toBe(
		`Wiped sandbox ${SANDBOX_ID}. Run atmn push to rebuild it from your config.\n`,
	);
});

test("--yes with nothing pinned wipes the org's default sandbox", async () => {
	setKey({ name: "AUTUMN_SECRET_KEY", value: "am_sk_test_org" });
	const output = capture();
	const calls: unknown[] = [];

	await runReset({
		client: fakeClient({ calls }),
		target: defaultTarget,
		yes: true,
		write: output.write,
	});

	expect(calls.length).toBe(1);
	expect(output.text()).toBe(
		"Wiped your main sandbox. Run atmn push to rebuild it from your config.\n",
	);
});

test("a live key is refused before anything is sent", async () => {
	setKey({ name: "AUTUMN_SECRET_KEY", value: "am_sk_live_org" });
	const calls: unknown[] = [];

	await expect(
		runReset({
			client: fakeClient({ calls }),
			target: defaultTarget,
			yes: true,
			write: () => undefined,
		}),
	).rejects.toThrow(SANDBOX_ONLY_REFUSAL);
	expect(calls).toEqual([]);
});

test("--prod is refused on the target alone, whatever key is set", async () => {
	setKey({ name: "AUTUMN_PROD_SECRET_KEY", value: "am_sk_test_looks_fine" });
	const calls: unknown[] = [];

	await expect(
		runReset({
			client: fakeClient({ calls }),
			target: prodTarget,
			yes: true,
			write: () => undefined,
		}),
	).rejects.toThrow(SANDBOX_ONLY_REFUSAL);
	expect(calls).toEqual([]);
});
