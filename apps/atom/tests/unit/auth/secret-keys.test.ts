import { afterEach, expect, test } from "bun:test";
import { startSecretKeys } from "../../../src/auth/secretKeys/startSecretKeys.js";
import type { SecretKeys } from "../../../src/auth/secretKeys/types/secretKeys.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

const started: SecretKeys[] = [];
afterEach(() => {
	for (const keys of started.splice(0)) keys.stop();
});

/** Each sync gets Autumn's next answer in turn; null is a sync that failed. */
const autumnAnswering = (answers: (string[] | null)[]) => {
	const keys = startSecretKeys({
		findInvalid: async () => (answers.length ? answers.shift() : []) ?? null,
	});
	started.push(keys);
	return keys;
};

const knownOf = (keys: SecretKeys) =>
	[KEY_A, KEY_B].filter((keyHash) => keys.isKnown({ keyHash }));

test("a learned key opens nothing until Autumn's answer, which it asks for at once", async () => {
	const keys = autumnAnswering([[]]);

	keys.learn({ keyHash: KEY_A });
	const beforeAnswer = knownOf(keys);
	await Bun.sleep(1);

	expect(beforeAnswer).toEqual([]);
	expect(knownOf(keys)).toEqual([KEY_A]);
});

test("only a key Autumn names invalid is dropped; a failed sync drops nothing", async () => {
	const keys = autumnAnswering([[], [], null, [KEY_A]]);
	keys.learn({ keyHash: KEY_A });
	keys.learn({ keyHash: KEY_B });
	await Bun.sleep(1);

	await keys.sync();
	const afterFailedSync = knownOf(keys);
	await keys.sync();

	expect(afterFailedSync).toEqual([KEY_A, KEY_B]);
	expect(knownOf(keys)).toEqual([KEY_B]);
});

test("a pending key Autumn names invalid never opens the Atom", async () => {
	const keys = autumnAnswering([[KEY_A]]);

	keys.learn({ keyHash: KEY_A });
	await Bun.sleep(1);

	expect(knownOf(keys)).toEqual([]);
});
