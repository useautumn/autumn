const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const resolveNpmVersion = async ({
	ctx,
	packageName,
	minimumVersion,
	commitSha,
	taggedVersions = [],
	dryRun = false,
}: {
	ctx: { fetch: (url: string, options: RequestInit) => Promise<Response> };
	packageName: string;
	minimumVersion: string;
	commitSha: string;
	taggedVersions?: string[];
	dryRun?: boolean;
}) => {
	if (!stableVersion.test(minimumVersion)) {
		throw new Error(`Manifest version must be stable: ${minimumVersion}`);
	}
	let nextVersion = minimumVersion;
	const response = await ctx.fetch(
		`https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
		{ signal: AbortSignal.timeout(30_000) },
	);
	const registry = await response.json();
	const packageMissing =
		response.status === 404 && registry?.error === "Not found";
	if (!response.ok && !packageMissing) {
		throw new Error(`npm registry request failed: HTTP ${response.status}`);
	}
	const versions = packageMissing ? {} : registry?.versions;
	if (!versions || typeof versions !== "object" || Array.isArray(versions)) {
		throw new Error("npm registry returned invalid versions");
	}
	for (const [version, manifest] of Object.entries(versions)) {
		if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
			throw new Error(
				`npm registry returned an invalid manifest for ${version}`,
			);
		}
		const sameCommit = "gitHead" in manifest && manifest.gitHead === commitSha;
		const alreadyPublished = sameCommit || taggedVersions.includes(version);
		if (!dryRun && stableVersion.test(version) && alreadyPublished) {
			return { version, published: true };
		}
		if (
			stableVersion.test(version) &&
			Bun.semver.order(version, nextVersion) >= 0
		) {
			const [major, minor, patch] = version.split(".").map(BigInt);
			nextVersion = `${major}.${minor}.${patch + 1n}`;
		}
	}
	return { version: nextVersion, published: false };
};
