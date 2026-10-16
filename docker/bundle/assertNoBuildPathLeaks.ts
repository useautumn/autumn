import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_BUILD_PATH_LEAKS } from "./externals.ts";

const SOURCE_DIRS = ["node_modules", "server", "shared", "apps", "packages"];

/** Bun inlines CJS __dirname as the build machine's path; such a path won't exist in the runtime image. */
export const assertNoBuildPathLeaks = ({
	repoRoot,
	distDir,
}: {
	repoRoot: string;
	distDir: string;
}) => {
	const pattern = new RegExp(
		`${repoRoot.replaceAll("/", "\\/")}\\/(${SOURCE_DIRS.join("|")})\\/[^"'\`\\s]*`,
		"g",
	);

	const leaks = readdirSync(distDir, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".js"))
		.flatMap((file) =>
			[...readFileSync(join(distDir, file), "utf8").matchAll(pattern)].map(
				(match) => `${file}: ${match[0]}`,
			),
		)
		.filter(
			(leak) =>
				!ALLOWED_BUILD_PATH_LEAKS.some((allowed) => leak.includes(allowed)),
		);

	if (leaks.length > 0) {
		throw new Error(
			`Bundles reference build-time paths that won't exist at runtime; externalize these packages:\n${[...new Set(leaks)].join("\n")}`,
		);
	}
};
