import { describe, expect, test } from "bun:test";
import { resolveNpmVersion } from "./resolveNpmVersion";

const commitSha = "a".repeat(40);
const resolve = ({
	versions = {},
	minimumVersion = "2.0.0",
	taggedVersions = [],
	dryRun = false,
}: {
	versions?: Record<string, { gitHead?: string }>;
	minimumVersion?: string;
	taggedVersions?: string[];
	dryRun?: boolean;
} = {}) =>
	resolveNpmVersion({
		ctx: { fetch: async () => Response.json({ versions }) },
		packageName: "example-package",
		minimumVersion,
		commitSha,
		taggedVersions,
		dryRun,
	});

describe("npm release version", () => {
	test("starts at the manifest minimum when it exceeds published versions", async () => {
		expect(await resolve({ versions: { "1.9.99": {} } })).toEqual({
			version: "2.0.0",
			published: false,
		});
	});

	test("advances beyond published patches rather than filling holes", async () => {
		expect(
			await resolve({ versions: { "2.0.0": {}, "2.0.1": {}, "2.0.3": {} } }),
		).toEqual({ version: "2.0.4", published: false });
	});

	test("advances beyond a higher minor or major regardless of registry order", async () => {
		for (const versions of [
			{ "1.3.2": {}, "1.2.56": {} },
			{ "1.2.56": {}, "1.3.2": {} },
		]) {
			expect(await resolve({ minimumVersion: "1.2.17", versions })).toEqual({
				version: "1.3.3",
				published: false,
			});
		}
		expect(await resolve({ versions: { "3.0.0": {} } })).toEqual({
			version: "3.0.1",
			published: false,
		});
	});

	test("honors explicit minor and major manifest changes", async () => {
		for (const minimumVersion of ["2.1.0", "3.0.0"]) {
			expect(
				await resolve({ minimumVersion, versions: { "2.0.99": {} } }),
			).toEqual({
				version: minimumVersion,
				published: false,
			});
		}
	});

	test("skips a published tag at this SHA without using tags for allocation", async () => {
		expect(
			await resolve({ versions: { "2.0.0": {} }, taggedVersions: ["2.0.0"] }),
		).toEqual({
			version: "2.0.0",
			published: true,
		});
		expect(await resolve({ taggedVersions: ["2.0.0", "9.0.0"] })).toEqual({
			version: "2.0.0",
			published: false,
		});
	});

	test("recovers npm success followed by missing git tag from gitHead", async () => {
		expect(
			await resolve({ versions: { "2.0.0": { gitHead: commitSha } } }),
		).toEqual({
			version: "2.0.0",
			published: true,
		});
	});

	test("does not skip another commit or a prerelease", async () => {
		expect(
			await resolve({
				versions: {
					"2.0.0": { gitHead: "b".repeat(40) },
					"2.0.1-beta.1": { gitHead: commitSha },
				},
			}),
		).toEqual({
			version: "2.0.1",
			published: false,
		});
	});

	test("dry runs still build an unpublished version on a rerun", async () => {
		expect(
			await resolve({
				dryRun: true,
				versions: { "2.0.0": { gitHead: commitSha } },
				taggedVersions: ["2.0.0"],
			}),
		).toEqual({
			version: "2.0.1",
			published: false,
		});
	});

	test("queries the supplied package, including scoped test overrides", async () => {
		let requestedUrl = "";
		const result = await resolveNpmVersion({
			ctx: {
				fetch: async (url) => {
					requestedUrl = url;
					return Response.json({ error: "Not found" }, { status: 404 });
				},
			},
			packageName: "@example/test-package",
			minimumVersion: "2.0.0",
			commitSha,
		});
		expect(requestedUrl).toBe(
			"https://registry.npmjs.org/%40example%2Ftest-package",
		);
		expect(result).toEqual({ version: "2.0.0", published: false });
	});

	test("rejects registry outages, authentication errors, and invalid payloads", async () => {
		for (const response of [
			Response.json({ error: "unavailable" }, { status: 500 }),
			Response.json({ error: "unauthorized" }, { status: 401 }),
			Response.json({ error: "forbidden" }, { status: 403 }),
			Response.json({ error: "rate limited" }, { status: 429 }),
			Response.json({}, { status: 404 }),
			new Response("invalid json"),
			Response.json({}),
			Response.json({ versions: [] }),
			Response.json({ versions: { "2.0.0": null } }),
		]) {
			await expect(
				resolveNpmVersion({
					ctx: { fetch: async () => response },
					packageName: "example-package",
					minimumVersion: "2.0.0",
					commitSha,
				}),
			).rejects.toThrow();
		}
	});

	test("fails closed on network errors", async () => {
		await expect(
			resolveNpmVersion({
				ctx: {
					fetch: async () => {
						throw new Error("network unavailable");
					},
				},
				packageName: "example-package",
				minimumVersion: "2.0.0",
				commitSha,
			}),
		).rejects.toThrow("network unavailable");
	});

	test("rejects nonstable manifest versions", async () => {
		for (const minimumVersion of [
			"2.0.0-beta.1",
			"v2.0.0",
			"2.0",
			"02.0.0",
			"garbage",
		]) {
			await expect(resolve({ minimumVersion })).rejects.toThrow(
				"must be stable",
			);
		}
	});
});
