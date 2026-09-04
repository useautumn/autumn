import { generate } from "./generate";

/**
 * Regenerating must leave the working tree clean. A diff here means the spec
 * moved and the committed CLI did not — exactly the drift that made v2's
 * hand-rolled client wrong, found in CI rather than in production.
 *
 * Checked against git, not against a second run: idempotency is necessary but
 * says nothing about whether what is COMMITTED is current.
 */
const main = async (): Promise<void> => {
	const paths = await generate();

	const status = Bun.spawnSync([
		"git",
		"status",
		"--porcelain",
		"--",
		...paths,
	]);
	const dirty = status.stdout.toString().trim();

	if (dirty) {
		console.error(
			`generated output is out of date — run \`bun generate\` and commit:\n${dirty}`,
		);
		const diff = Bun.spawnSync(["git", "--no-pager", "diff", "--", ...paths]);
		console.error(diff.stdout.toString());
		process.exit(1);
	}

	console.log(`generated output is current (${paths.length} files)`);
};

await main();
