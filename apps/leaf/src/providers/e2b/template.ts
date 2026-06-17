import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Template } from "e2b";
import { E2B_RESOURCES } from "./config.js";

// Where the bridge install is baked in the template. Persistent (unlike /tmp,
// which a microVM may tmpfs-mount), world-writable so the non-root runtime user
// can write the per-session bridge files the adapter drops in. The adapter's
// hardcoded /tmp/harness/claude-code is symlinked here at session start.
export const BAKED_BRIDGE_DIR = "/opt/harness/claude-code";
export const BRIDGE_BOOTSTRAP_DIR = "/tmp/harness/claude-code";

const require = createRequire(import.meta.url);

// Bump when the build steps below change so a fresh template is forked (the name
// is otherwise keyed only to the bridge's package.json + lockfile).
const RECIPE_VERSION = "v3";

const bridgeAssetDir = (): string => {
	const pkgJson = require.resolve("@ai-sdk/harness-claude-code/package.json");
	return join(dirname(pkgJson), "src", "bridge");
};

// Template identity = hash of the bridge's package.json + lockfile, so a bridge
// version bump forks a fresh template instead of reusing a stale baked install.
export const bakedTemplateName = (): {
	name: string;
	pkgPath: string;
	lockPath: string;
} => {
	const dir = bridgeAssetDir();
	const pkgPath = join(dir, "package.json");
	const lockPath = join(dir, "pnpm-lock.yaml");
	const hash = createHash("sha256")
		.update(RECIPE_VERSION)
		.update(readFileSync(pkgPath))
		.update(readFileSync(lockPath))
		.digest("hex")
		.slice(0, 12);
	return { name: `leaf-claude-bridge-${hash}`, pkgPath, lockPath };
};

// Builds (once, durably on E2B infra) a template that bakes node + pnpm + the
// claude-code bridge install so cold starts skip the ~30s reinstall. The bridge's
// package.json + lockfile are inlined via base64 (E2B's copy() needs a build
// context dir; inlining avoids uploading the repo and preserves the exact
// lockfile so the runtime --frozen-lockfile install is a no-op).
export const buildBakedTemplate = async (): Promise<string> => {
	const { name, pkgPath, lockPath } = bakedTemplateName();
	const pkgB64 = readFileSync(pkgPath).toString("base64");
	const lockB64 = readFileSync(lockPath).toString("base64");
	const template = Template()
		.fromNodeImage("24")
		.runCmd("npm install -g pnpm@9", { user: "root" })
		.runCmd(
			[
				`mkdir -p ${BAKED_BRIDGE_DIR}`,
				`echo ${pkgB64} | base64 -d > ${BAKED_BRIDGE_DIR}/package.json`,
				`echo ${lockB64} | base64 -d > ${BAKED_BRIDGE_DIR}/pnpm-lock.yaml`,
				`cd ${BAKED_BRIDGE_DIR} && pnpm install --frozen-lockfile --store-dir ${BAKED_BRIDGE_DIR}/.pnpm-store`,
				`cd ${BAKED_BRIDGE_DIR} && node node_modules/@anthropic-ai/claude-code/install.cjs`,
				// World-readable so the non-root runtime user can copy node_modules into
				// its own writable bootstrap dir (a symlink would leave files root-owned,
				// and the adapter re-runs install.cjs which must unlink/chmod the binary).
				`chmod -R a+rX ${BAKED_BRIDGE_DIR}`,
			],
			{ user: "root" },
		);
	await Template.build(template, name, {
		cpuCount: E2B_RESOURCES.cpuCount,
		memoryMB: E2B_RESOURCES.memoryMB,
	});
	return name;
};
