import { join } from "node:path";
import { resolveNpmVersion } from "../../scripts/release/resolveNpmVersion";

const PUBLISHED_PACKAGE_DIRS = [
	"packages/autumn-js",
	"packages/atmn",
	"packages/gateway",
];

const root = join(import.meta.dir, "../..");

// Keep each manifest on the next unpublished version so a release publishes exactly what main says.
for (const packageDir of PUBLISHED_PACKAGE_DIRS) {
	const manifestFile = Bun.file(join(root, packageDir, "package.json"));
	const manifestText = await manifestFile.text();
	const manifest = JSON.parse(manifestText);
	const { version } = await resolveNpmVersion({
		ctx: { fetch },
		packageName: manifest.name,
		minimumVersion: manifest.version,
		commitSha: "",
		dryRun: true,
	});
	if (version === manifest.version) continue;

	await Bun.write(
		manifestFile,
		manifestText.replace(
			`"version": "${manifest.version}"`,
			`"version": "${version}"`,
		),
	);
	console.log(`${manifest.name}: ${manifest.version} -> ${version}`);
}
