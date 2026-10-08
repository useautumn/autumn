import { createHash } from "node:crypto";
import { NATIVE_BUILD_RECIPE } from "./nativePackage.js";

/** Names one native build: the patched sources that go into it and the machine it runs on. */
export function nativeBuildKeyOf({
	sources,
	platform,
	arch,
}: {
	/** Path → contents of every file the addon is compiled from. */
	sources: ReadonlyMap<string, string>;
	platform: string;
	arch: string;
}): string {
	const hash = createHash("sha256");
	hash.update(`recipe:${NATIVE_BUILD_RECIPE}\0${platform}\0${arch}\0`);
	for (const path of [...sources.keys()].sort()) {
		hash.update(`${path}\0${sources.get(path)}\0`);
	}
	return hash.digest("hex").slice(0, 16);
}
