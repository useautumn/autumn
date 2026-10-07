import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import {
	defaultSubjectSnapshotsEdgeConfig,
	EDGE_CONFIG_TIMESTAMP_KEY,
	type EdgeConfigS3Client,
	type SubjectSnapshotsEdgeConfig,
	subjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import { RecaseError, Scopes } from "@autumn/shared";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import { z } from "zod/v4";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetAdminSubjectSnapshotsConfig } from "@/internal/admin/handleGetAdminSubjectSnapshotsConfig.js";
import { handleUpsertAdminSubjectSnapshotsConfig } from "@/internal/admin/handleUpsertAdminSubjectSnapshotsConfig.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import { subjectSnapshotsStore } from "@/internal/misc/subjectSnapshots/subjectSnapshotsStore.js";

const CONFIG_KEY = subjectSnapshotsEdgeConfig.key;

/** An in-memory bucket: every put lands in `objects`, in order in `puts`. */
const objects = new Map<string, string>();
const puts: string[] = [];
const fakeS3: EdgeConfigS3Client = {
	send: async (command) => {
		const { Key, Body } = command.input as { Key: string; Body?: string };
		if (command instanceof PutObjectCommand) {
			objects.set(Key, String(Body));
			puts.push(Key);
			return {};
		}
		if (command instanceof GetObjectCommand) {
			const body = objects.get(Key);
			if (body === undefined) {
				throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
			}
			return { Body: { transformToString: async () => body } };
		}
		throw new Error("unexpected S3 command");
	},
};

const bucketStore = createEdgeConfigStore<SubjectSnapshotsEdgeConfig>({
	s3Key: CONFIG_KEY,
	schema: subjectSnapshotsEdgeConfig.schema,
	defaultValue: subjectSnapshotsEdgeConfig.defaultValue,
	s3Client: fakeS3,
});
const read = spyOn(subjectSnapshotsStore, "readFromSource").mockImplementation(
	bucketStore.readFromSource,
);
const write = spyOn(subjectSnapshotsStore, "writeToSource").mockImplementation(
	bucketStore.writeToSource,
);

afterEach(() => {
	objects.clear();
	puts.length = 0;
	read.mockClear();
	write.mockClear();
});
afterAll(() => {
	read.mockRestore();
	write.mockRestore();
});

const createApp = ({ scopes }: { scopes: string[] }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", { scopes } as HonoEnv["Variables"]["ctx"]);
		await next();
	});
	app.onError(
		(error) =>
			new Response(error.message, {
				status:
					error instanceof RecaseError
						? error.statusCode
						: error instanceof z.ZodError
							? 400
							: 500,
			}),
	);
	app.get(
		"/admin/subject-snapshots-config",
		...handleGetAdminSubjectSnapshotsConfig,
	);
	app.put(
		"/admin/subject-snapshots-config",
		...handleUpsertAdminSubjectSnapshotsConfig,
	);
	return app;
};

const superuser = [Scopes.Superuser];
const load = ({ scopes = superuser }: { scopes?: string[] } = {}) =>
	createApp({ scopes }).request("/admin/subject-snapshots-config");
const save = ({
	config,
	scopes = superuser,
}: {
	config: unknown;
	scopes?: string[];
}) =>
	createApp({ scopes }).request("/admin/subject-snapshots-config", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(config),
	});

const seed = (config: SubjectSnapshotsEdgeConfig) =>
	objects.set(CONFIG_KEY, JSON.stringify(config));
const stored = (): SubjectSnapshotsEdgeConfig =>
	JSON.parse(objects.get(CONFIG_KEY) ?? "null");
const withMode = (
	mode: SubjectSnapshotsEdgeConfig["mode"],
): SubjectSnapshotsEdgeConfig => ({
	...defaultSubjectSnapshotsEdgeConfig(),
	mode,
	writtenAfter: 1_000,
});

test("a missing record loads as off with the defaults, and healthy", async () => {
	const response = await load();
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		...defaultSubjectSnapshotsEdgeConfig(),
		configHealthy: true,
		error: null,
	});
});

test("a record the strict schema refuses loads as unhealthy, with the defaults beside it", async () => {
	objects.set(CONFIG_KEY, JSON.stringify({ mode: "warm" }));
	const body = await (await load()).json();
	expect(body).toMatchObject({
		...defaultSubjectSnapshotsEdgeConfig(),
		configHealthy: false,
	});
	expect(body.error).toBeString();
});

test("a save writes the record, then bumps the edge config timestamp", async () => {
	seed(withMode("write"));
	const next = { ...withMode("verify"), dropBatch: 250 };
	const response = await save({ config: next });
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ success: true, config: next });
	expect(stored()).toEqual(next);
	expect(puts).toEqual([CONFIG_KEY, EDGE_CONFIG_TIMESTAMP_KEY]);
	expect(
		JSON.parse(objects.get(EDGE_CONFIG_TIMESTAMP_KEY) ?? "{}").updatedAt,
	).toBeString();
});

test("leaving off stamps writtenAfter with now in the same save, whatever the caller sent", async () => {
	seed(withMode("off"));
	const before = Date.now();
	const response = await save({ config: withMode("write") });
	const { config } = await response.json();
	expect(config.writtenAfter).toBeGreaterThanOrEqual(before);
	expect(config.writtenAfter).toBeLessThanOrEqual(Date.now());
	expect(stored().writtenAfter).toBe(config.writtenAfter);
	expect(puts).toEqual([CONFIG_KEY, EDGE_CONFIG_TIMESTAMP_KEY]);
});

test("a missing or unreadable record counts as off, so the save stamps writtenAfter", async () => {
	const before = Date.now();
	await save({ config: withMode("serve") });
	expect(stored().writtenAfter).toBeGreaterThanOrEqual(before);

	objects.set(CONFIG_KEY, "{ not json");
	const unreadableBefore = Date.now();
	await save({ config: withMode("write") });
	expect(stored().writtenAfter).toBeGreaterThanOrEqual(unreadableBefore);
});

test("moving between modes past off keeps writtenAfter as sent", async () => {
	seed(withMode("verify"));
	await save({ config: withMode("serve") });
	expect(stored()).toEqual(withMode("serve"));
});

test("invalid input is refused whole and nothing is written", async () => {
	seed(withMode("write"));
	const invalid = [
		{ ...withMode("write"), mode: "warm" },
		{ ...withMode("write"), unknownKnob: 1 },
		{ ...withMode("write"), maxBytes: 0 },
		{ ...withMode("write"), dropBatch: 5_001 },
		{ ...withMode("write"), refreshConcurrency: 1.5 },
		{ ...withMode("write"), refreshMaxPending: -1 },
		{ ...withMode("write"), writtenAfter: "yesterday" },
	];
	for (const config of invalid) {
		expect((await save({ config })).status, JSON.stringify(config)).toBe(400);
	}
	expect(write).not.toHaveBeenCalled();
	expect(puts).toEqual([]);
	expect(stored()).toEqual(withMode("write"));
});

test("only a superuser can read or save", async () => {
	const scopes = [Scopes.Public];
	expect((await load({ scopes })).status).toBe(403);
	expect((await save({ config: withMode("serve"), scopes })).status).toBe(403);
	expect(read).not.toHaveBeenCalled();
	expect(write).not.toHaveBeenCalled();
});
