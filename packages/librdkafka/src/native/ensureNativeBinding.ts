import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { availableParallelism, homedir } from "node:os";
import { dirname, join } from "node:path";
import { nativeBuildKeyOf } from "./nativeBuildKey.js";
import { CONFLUENT_PACKAGE, NATIVE_BINARY_FILE } from "./nativePackage.js";
import { nativeToolchainOf } from "./nativeToolchain.js";

export type NativeBindingOutcome = "current" | "restored" | "built";

type NativeBuildPaths = {
	/** The installed (patched) package `bindings` loads the addon from. */
	packageDir: string;
	installed: string;
	marker: string;
	cached: string;
	scratch: string;
};

const packageRoot = join(import.meta.dir, "../..");

function resolvePackageDir(): string {
	return dirname(
		require.resolve(`${CONFLUENT_PACKAGE}/package.json`, {
			paths: [packageRoot],
		}),
	);
}

function readSources({
	packageDir,
}: {
	packageDir: string;
}): Map<string, string> {
	const sources = new Map<string, string>();
	sources.set(
		"binding.gyp",
		readFileSync(join(packageDir, "binding.gyp"), "utf8"),
	);
	sources.set(
		"deps/librdkafka.gyp",
		readFileSync(join(packageDir, "deps", "librdkafka.gyp"), "utf8"),
	);
	// librdkafka is compiled from deps/ too, and patched there.
	for (const dir of ["src", "deps/librdkafka/src", "deps/librdkafka/src-cpp"])
		for (const entry of readdirSync(join(packageDir, dir), {
			withFileTypes: true,
		}).sort((a, b) => a.name.localeCompare(b.name)))
			if (entry.isFile())
				sources.set(
					`${dir}/${entry.name}`,
					readFileSync(join(packageDir, dir, entry.name), "utf8"),
				);
	return sources;
}

function pathsOf({
	key,
	packageDir,
}: {
	key: string;
	packageDir: string;
}): NativeBuildPaths {
	const cacheDir =
		process.env.LIBRDKAFKA_CACHE_DIR ??
		join(homedir(), ".cache", "autumn-librdkafka");
	const releaseDir = join(packageDir, "build", "Release");
	return {
		packageDir,
		installed: join(releaseDir, NATIVE_BINARY_FILE),
		marker: join(releaseDir, ".autumn-build-key"),
		cached: join(cacheDir, `${key}.node`),
		// Per process: two cold builds of one key must not delete each other's tree.
		scratch: join(cacheDir, `build-${key}-${process.pid}`),
	};
}

/** A process may have the old addon mapped; a rename replaces the file without rewriting the pages it reads. */
function copyAtomically({ from, to }: { from: string; to: string }): void {
	const temporary = `${to}.${process.pid}.tmp`;
	copyFileSync(from, temporary);
	renameSync(temporary, to);
}

function install({
	paths,
	key,
	from,
}: {
	paths: NativeBuildPaths;
	key: string;
	from: string;
}): void {
	mkdirSync(dirname(paths.installed), { recursive: true });
	copyAtomically({ from, to: paths.installed });
	writeFileSync(paths.marker, key);
}

/** Compiles in a scratch copy: the installed package may share inodes with Bun's global cache. */
async function compile({ paths }: { paths: NativeBuildPaths }): Promise<void> {
	rmSync(paths.scratch, { recursive: true, force: true });
	cpSync(paths.packageDir, paths.scratch, {
		recursive: true,
		dereference: true,
	});
	const modules = join(paths.scratch, "node_modules");
	mkdirSync(modules, { recursive: true });
	symlinkSync(
		dirname(
			require.resolve("node-addon-api/package.json", { paths: [packageRoot] }),
		),
		join(modules, "node-addon-api"),
	);
	// binding.gyp shells out to `node`; where only Bun exists, Bun answers for it.
	const shims = join(paths.scratch, ".shims");
	mkdirSync(shims, { recursive: true });
	if (!Bun.which("node")) symlinkSync(process.execPath, join(shims, "node"));
	const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
		paths: [packageRoot],
	});
	const runtime = Bun.which("node") ?? process.execPath;
	const env = { ...process.env, PATH: `${shims}:${process.env.PATH ?? ""}` };
	const jobs = String(availableParallelism());
	// librdkafka.gyp writes config.h from an action a parallel make does not wait for; run it first.
	const steps = [
		{ cwd: paths.scratch, args: [nodeGyp, "configure"] },
		{ cwd: join(paths.scratch, "deps"), args: ["../util/configure"] },
		{ cwd: paths.scratch, args: [nodeGyp, "build", "-j", jobs] },
	];
	for (const { cwd, args } of steps) {
		const step = Bun.spawn([runtime, ...args], {
			cwd,
			env,
			stdout: "inherit",
			stderr: "inherit",
		});
		if ((await step.exited) !== 0) {
			throw new Error(`${args.join(" ")} failed in ${cwd}`);
		}
	}
	mkdirSync(dirname(paths.cached), { recursive: true });
	copyAtomically({
		from: join(paths.scratch, "build", "Release", NATIVE_BINARY_FILE),
		to: paths.cached,
	});
	rmSync(paths.scratch, { recursive: true, force: true });
}

/** The key this machine's build of the installed patched sources is cached under. */
export function nativeBuildKey(): string {
	return nativeBuildKeyOf({
		sources: readSources({ packageDir: resolvePackageDir() }),
		platform: process.platform,
		arch: process.arch,
		toolchain: nativeToolchainOf(),
	});
}

/** Puts a native build of the patched sources where `bindings` looks, compiling only on a cache miss. */
export async function ensureNativeBinding(): Promise<NativeBindingOutcome> {
	const packageDir = resolvePackageDir();
	const key = nativeBuildKey();
	const paths = pathsOf({ key, packageDir });
	if (existsSync(paths.installed) && existsSync(paths.marker)) {
		if (readFileSync(paths.marker, "utf8") === key) return "current";
	}
	if (existsSync(paths.cached)) {
		install({ paths, key, from: paths.cached });
		return "restored";
	}
	await compile({ paths });
	install({ paths, key, from: paths.cached });
	return "built";
}
