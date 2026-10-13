import { describe, expect, test } from "bun:test";
import {
	assertPinnedBun,
	assertProject,
	atomInputMatcher,
	decideRelease,
	releaseTitle,
} from "./atom-release";

const SHA = "a".repeat(40);
const BASE = "b".repeat(40);
const release = (commitSha: string, createdAt: string, dirty = false) => ({
	id: `rel_${commitSha.slice(0, 4)}`,
	createdAt,
	currentChannels: [],
	gitMetadata: { commitSha, dirty },
});

describe("assertProject", () => {
	test("passes when Alien answers for the named project and every channel is its", () => {
		expect(() =>
			assertProject({
				project: "autumn",
				answered: { id: "prj_a", name: "autumn" },
				channels: [{ projectId: "prj_a" }],
			}),
		).not.toThrow();
	});
	test("refuses an answer for another project, or a channel from one", () => {
		expect(() =>
			assertProject({
				project: "autumn",
				answered: { id: "prj_s", name: "autumn-staging" },
				channels: [],
			}),
		).toThrow();
		expect(() =>
			assertProject({
				project: "autumn",
				answered: { id: "prj_a", name: "autumn" },
				channels: [{ projectId: "prj_s" }, { projectId: "prj_a" }],
			}),
		).toThrow();
	});
});

describe("assertPinnedBun", () => {
	test("passes when the bun on PATH is the one package.json pins", () => {
		expect(() =>
			assertPinnedBun({ packageManager: "bun@1.4.2", found: "1.4.2" }),
		).not.toThrow();
	});
	test("refuses any other bun, or a packageManager that pins none", () => {
		expect(() =>
			assertPinnedBun({ packageManager: "bun@1.4.2", found: "1.3.14" }),
		).toThrow("Expected bun 1.4.2");
		expect(() =>
			assertPinnedBun({ packageManager: "pnpm@9.0.0", found: "1.4.2" }),
		).toThrow("pins no Bun version");
	});
});

describe("atomInputMatcher", () => {
	const isAtomInput = atomInputMatcher({
		bundledFiles: [
			"apps/atom/src/main.ts",
			"shared/utils/x.ts",
			"node_modules/hono/dist/index.js",
		],
		workspaceDirs: ["apps/atom", "shared", "server"],
	});
	test("bundled files, their workspaces' configs, the stack and the install count", () => {
		for (const file of [
			"apps/atom/src/main.ts",
			"shared/utils/x.ts",
			"shared/package.json",
			"apps/atom/bunfig.toml",
			"packages/alien/stacks/byoc/alien.json",
			"bun.lock",
			"patches/hono.patch",
		])
			expect(isAtomInput(file)).toBe(true);
	});
	test("files the Atom never reads don't", () => {
		for (const file of [
			"shared/utils/unused.ts",
			"server/src/index.ts",
			"server/package.json",
			"vite/src/App.tsx",
		])
			expect(isAtomInput(file)).toBe(false);
	});
});

describe("decideRelease", () => {
	const base = {
		sha: SHA,
		isReleasedAncestor: (releasedSha: string) => releasedSha === BASE,
		isAtomInput: (file: string) => file.startsWith("apps/atom/"),
	};
	test("skips a commit that already has a release (a retried or re-run job)", () => {
		expect(
			decideRelease({
				...base,
				releases: [release(SHA, "2026-10-12T10:00:00Z")],
				changedFilesSince: () => ["apps/atom/src/main.ts"],
			}).release,
		).toBe(false);
	});
	test("diffs against the last clean release on the branch, so a cancelled run's changes still ship", () => {
		const seen: string[] = [];
		const decision = decideRelease({
			...base,
			releases: [
				release(BASE, "2026-10-11T10:00:00Z"),
				release("c".repeat(40), "2026-10-12T09:00:00Z"),
				release("d".repeat(40), "2026-10-12T09:30:00Z", true),
			],
			changedFilesSince: (baseSha) => {
				seen.push(baseSha);
				return ["apps/atom/src/x.ts", "vite/a.tsx"];
			},
		});
		expect(seen).toEqual([BASE]);
		expect(decision.release).toBe(true);
	});
	test("skips when no Atom input changed", () => {
		expect(
			decideRelease({
				...base,
				releases: [release(BASE, "2026-10-11T10:00:00Z")],
				changedFilesSince: () => ["vite/a.tsx"],
			}).release,
		).toBe(false);
	});
	test("releases when nothing on the branch was released before", () => {
		expect(
			decideRelease({ ...base, releases: [], changedFilesSince: () => [] })
				.release,
		).toBe(true);
	});
});

describe("releaseTitle", () => {
	test("leads with the PR, else the commit subject", () => {
		expect(
			releaseTitle({
				pullRequest: { number: 4612, title: "Atom push batching" },
				subject: "x",
			}),
		).toBe("#4612 Atom push batching");
		expect(releaseTitle({ pullRequest: null, subject: "fix(atom): y" })).toBe(
			"fix(atom): y",
		);
	});
});
