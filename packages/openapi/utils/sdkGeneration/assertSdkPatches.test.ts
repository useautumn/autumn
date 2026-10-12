import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertSdkPatches } from "./assertSdkPatches.js";

const PATCH = `diff --git a/src/lib/config.ts b/src/lib/config.ts
--- a/src/lib/config.ts
+++ b/src/lib/config.ts
@@ -1,2 +1,3 @@
   serverURL?: string | undefined;
+  edgeURL?: string | undefined;
   /**
`;

const sdkDirs: string[] = [];

afterEach(() => {
	for (const dir of sdkDirs.splice(0)) rmSync(dir, { recursive: true });
});

const sdkWith = ({ config }: { config: string }) => {
	const dir = mkdtempSync(path.join(tmpdir(), "sdk-"));
	sdkDirs.push(dir);
	mkdirSync(path.join(dir, ".speakeasy/patches/src/lib"), { recursive: true });
	mkdirSync(path.join(dir, "src/lib"), { recursive: true });
	writeFileSync(
		path.join(dir, ".speakeasy/patches/src/lib/config.ts.patch"),
		PATCH,
	);
	writeFileSync(path.join(dir, "src/lib/config.ts"), config);
	return dir;
};

test("passes when every patched line was generated", () => {
	const sdkDir = sdkWith({
		config:
			"  serverURL?: string | undefined;\n  edgeURL?: string | undefined;\n",
	});
	expect(() => assertSdkPatches({ sdkDir, label: "TS" })).not.toThrow();
});

test("throws when Speakeasy dropped a patch", () => {
	const sdkDir = sdkWith({
		config: "  serverURL?: string | undefined;\n",
	});
	expect(() => assertSdkPatches({ sdkDir, label: "TS" })).toThrow(
		"src/lib/config.ts: edgeURL?: string | undefined;",
	);
});
