import { resolve } from "node:path";
import { mirrorPublicSkills } from "./publicSkills.js";

const targetRepository = process.argv[2];
if (!targetRepository) {
	throw new Error(
		"Usage: bun run scripts/mirrorPublicSkills.ts <skills-repository> [source-commit]",
	);
}

mirrorPublicSkills({
	generatedDirectory: resolve(import.meta.dir, "../generated/skills"),
	sourceCommit: process.argv[3] ?? process.env.GITHUB_SHA ?? "local",
	targetRepository: resolve(targetRepository),
});

process.stdout.write(`Mirrored public skills into ${targetRepository}\n`);
