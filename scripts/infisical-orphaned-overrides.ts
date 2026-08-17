#!/usr/bin/env bun
/**
 * Find personal Infisical overrides still at `/` whose keys also exist as
 * shared secrets under a nested folder (orphaned after a folder move).
 *
 * Skips `/cloud`. Skips keys that still have a shared (non-personal) secret
 * at `/` — those are real overrides, not orphans.
 *
 * Prints a ready `infisical secrets delete …` command; does not delete.
 *
 * Usage:
 *   bun scripts/infisical-orphaned-overrides.ts
 */

const env = "dev";
const skippedFolderPrefixes = ["/cloud"];

const isSkippedFolder = (path: string) =>
	skippedFolderPrefixes.some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);

type InfisicalSecret = {
	key: string;
	type: string;
	secretPath?: string;
};

type InfisicalFolder = {
	folderName?: string;
	name?: string;
	folderPath?: string;
};

const runJson = async <T>(args: string[]): Promise<T[]> => {
	const proc = Bun.spawn(["infisical", ...args, "--silent"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(
			`infisical ${args.join(" ")} failed (${code}): ${stderr || stdout}`,
		);
	}
	const parsed = JSON.parse(stdout || "[]") as T[] | null;
	return parsed ?? [];
};

const listFolders = async (path: string) => {
	const folders = await runJson<InfisicalFolder>([
		"secrets",
		"folders",
		"get",
		"-p",
		path,
		"-o",
		"json",
		"--env",
		env,
	]);
	return folders.flatMap((f) => {
		const name = f.folderName || f.name;
		if (!name) return [];
		const base = (f.folderPath || path || "/").replace(/\/$/, "") || "";
		return [`${base}/${name}`.replace(/\/+/g, "/") || "/"];
	});
};

const walkFolders = async (path = "/"): Promise<string[]> => {
	const out = [path];
	for (const child of await listFolders(path)) {
		if (isSkippedFolder(child)) continue;
		out.push(...(await walkFolders(child)));
	}
	return out;
};

const exportSecrets = async ({
	path,
	secretOverriding,
}: {
	path: string;
	secretOverriding: boolean;
}) =>
	runJson<InfisicalSecret>([
		"export",
		"--env",
		env,
		"--path",
		path,
		"--format",
		"json",
		`--secret-overriding=${secretOverriding}`,
	]);

const findOrphanedOverrides = async () => {
	const rootPersonal = (
		await exportSecrets({ path: "/", secretOverriding: true })
	).filter((s) => s.type === "personal" && (s.secretPath || "/") === "/");

	const rootSharedKeys = new Set(
		(
			await exportSecrets({ path: "/", secretOverriding: false })
		)
			.filter((s) => s.type === "shared" && (s.secretPath || "/") === "/")
			.map((s) => s.key),
	);

	const sharedElsewhere = new Map<string, string[]>();
	for (const path of await walkFolders("/")) {
		if (path === "/" || isSkippedFolder(path)) continue;
		for (const s of await exportSecrets({
			path,
			secretOverriding: false,
		})) {
			if (s.type !== "shared") continue;
			const paths = sharedElsewhere.get(s.key) ?? [];
			paths.push(s.secretPath || path);
			sharedElsewhere.set(s.key, paths);
		}
	}

	const orphans = rootPersonal.flatMap((s) => {
		if (rootSharedKeys.has(s.key)) return [];
		const sharedPaths = sharedElsewhere.get(s.key);
		if (!sharedPaths) return [];
		return [{ key: s.key, sharedPaths }];
	});

	if (!orphans.length) {
		console.log(`No orphaned root personal overrides (env=${env}).`);
		return;
	}

	console.log(`# Orphaned personal overrides at / (env=${env})\n`);
	for (const o of orphans) {
		console.log(`# ${o.key}  ← shared at ${o.sharedPaths.join(", ")}`);
	}
	console.log("");
	console.log(
		[
			"infisical secrets delete",
			...orphans.map((o) => o.key),
			`--env=${env}`,
			"--path=/",
			"--type=personal",
		].join(" "),
	);
};

findOrphanedOverrides().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});

export {};
