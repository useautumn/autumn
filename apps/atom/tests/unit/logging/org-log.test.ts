import { expect, test } from "bun:test";
import { join } from "node:path";

const SRC = join(import.meta.dir, "../../../src");

/** A fresh Atom process: one line before Autumn's first keys check answers with the org, one after. */
const linesAroundFirstKeysCheck = () => {
	const script = `
		globalThis.fetch = async () =>
			Response.json({ invalid_key_hashes: [], org: { id: "org_test_1", slug: "acme-test" } });
		const { getAtomLogger } = await import(${JSON.stringify(`${SRC}/lib/logging/getAtomLogger.ts`)});
		const { createAutumnClient } = await import(${JSON.stringify(`${SRC}/autumnClient/createAutumnClient.ts`)});
		getAtomLogger().info({ type: "atom_ready" }, "before");
		await createAutumnClient({ autumnApiUrl: "https://api.autumn.example" })
			.findInvalidKeys({ tokenHash: "hash_1", keyHashes: ["key_1"] });
		getAtomLogger().warn({ type: "atom_journal_forward_failed" }, "after");
		await getAtomLogger().flush?.();`;
	const run = Bun.spawnSync(["bun", "-e", script]);
	return run.stdout
		.toString()
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
};

test("every line after Autumn's first keys check names the org as the server does, at context.org_id and context.org_slug; a line before names none", () => {
	const [before, after] = linesAroundFirstKeysCheck();

	expect(before).not.toHaveProperty("context");
	expect(after).toMatchObject({
		msg: "after",
		context: { org_id: "org_test_1", org_slug: "acme-test" },
	});
});
