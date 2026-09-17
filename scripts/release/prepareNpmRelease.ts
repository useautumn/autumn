import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolveNpmVersion } from "./resolveNpmVersion";

const packageDirectory = process.env.PACKAGE_DIR;
const commitSha = process.env.GITHUB_SHA;
const output = process.env.GITHUB_OUTPUT;
const tagPrefix = process.env.TAG_PREFIX;
if (!packageDirectory || !commitSha || !output || !tagPrefix) {
	throw new Error("Missing release environment");
}
const manifest = await Bun.file(`${packageDirectory}/package.json`).json();
const taggedVersions = process.env.PUBLISH_NAME_OVERRIDE
	? []
	: execFileSync("git", ["tag", "--points-at", commitSha], { encoding: "utf8" })
			.trim()
			.split("\n")
			.filter((tag) => tag.startsWith(`${tagPrefix}-v`))
			.map((tag) => tag.slice(`${tagPrefix}-v`.length));
const result = await resolveNpmVersion({
	ctx: { fetch },
	packageName: process.env.PUBLISH_NAME_OVERRIDE || manifest.name,
	minimumVersion: manifest.version,
	commitSha,
	taggedVersions,
	dryRun: process.env.DRY_RUN === "true",
});
appendFileSync(
	output,
	`version=${result.version}\npublished=${result.published}\n`,
);
console.log(
	`${result.published ? "Already published" : "Selected"}: ${result.version}`,
);
