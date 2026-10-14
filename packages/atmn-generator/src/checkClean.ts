import { generate } from "./generate";

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
