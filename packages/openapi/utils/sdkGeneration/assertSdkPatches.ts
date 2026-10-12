import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PATCHES_DIR = ".speakeasy/patches";

const listPatchFiles = ({ dir }: { dir: string }): string[] =>
	readdirSync(dir, { recursive: true, encoding: "utf-8" })
		.filter((file) => file.endsWith(".patch"))
		.map((file) => path.join(dir, file));

/** The lines one patch adds, by the file it targets. */
const addedLinesOf = ({ patch }: { patch: string }) => {
	const target = patch.match(/^\+\+\+ b\/(.+)$/m)?.[1];
	const added = patch
		.split("\n")
		.filter((line) => line.startsWith("+") && !line.startsWith("+++"))
		.map((line) => line.slice(1))
		.filter((line) => line.trim() !== "");
	return { target, added };
};

/**
 * Throws unless every line a Speakeasy patch file adds is in the regenerated SDK.
 * Speakeasy only warns when a patch's target is no longer generated, so a dropped patch would otherwise ship.
 */
export function assertSdkPatches({
	sdkDir,
	label,
}: {
	sdkDir: string;
	label: string;
}): void {
	const missing: string[] = [];
	for (const file of listPatchFiles({
		dir: path.join(sdkDir, PATCHES_DIR),
	})) {
		const { target, added } = addedLinesOf({
			patch: readFileSync(file, "utf-8"),
		});
		if (!target) throw new Error(`[${label}] ${file} names no target file`);
		const generated = readFileSync(path.join(sdkDir, target), "utf-8");
		for (const line of added)
			if (!generated.includes(line)) missing.push(`${target}: ${line.trim()}`);
	}
	if (missing.length > 0)
		throw new Error(
			`[${label}] Speakeasy patches missing from the regenerated SDK:\n${missing.join("\n")}`,
		);
	console.log(`[${label}] Speakeasy patches present in the regenerated SDK`);
}
