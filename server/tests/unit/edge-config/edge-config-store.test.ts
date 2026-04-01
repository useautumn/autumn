import { afterEach, describe, expect, jest, test } from "bun:test";
import type { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod/v4";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";

const TestConfigSchema = z.object({
	enabled: z.boolean().default(false),
	message: z.string().default("hello"),
});

type TestConfig = z.infer<typeof TestConfigSchema>;

const defaultConfig = (): TestConfig => ({ enabled: false, message: "hello" });

const createMockS3Client = ({
	getResponse,
}: {
	getResponse: () => {
		Body?: { transformToString: () => Promise<string> } | null;
	};
}): S3Client => {
	const sendFn = jest.fn(async (command: unknown) => {
		const commandName =
			command?.constructor?.name ?? (command as { name?: string })?.name;

		if (commandName === "GetObjectCommand") {
			return getResponse();
		}

		if (commandName === "PutObjectCommand") {
			return {};
		}

		throw new Error(`Unexpected command: ${commandName}`);
	});

	return { send: sendFn } as unknown as S3Client;
};

const makeBody = (data: unknown) => ({
	Body: {
		transformToString: async () => JSON.stringify(data),
	},
});

const makeNoSuchKeyError = () => {
	const error = new Error("NoSuchKey");
	error.name = "NoSuchKey";
	return error;
};

describe("createEdgeConfigStore", () => {
	let store: ReturnType<typeof createEdgeConfigStore<TestConfig>>;

	afterEach(() => {
		store?.stopPolling();
	});

	describe("initial fetch via startPolling", () => {
		test("populates get() with parsed config from S3", async () => {
			const mockClient = createMockS3Client({
				getResponse: () => makeBody({ enabled: true, message: "from-s3" }),
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();

			expect(store.get()).toEqual({ enabled: true, message: "from-s3" });
			expect(store.getStatus().healthy).toBe(true);
			expect(store.getStatus().configured).toBe(true);
			expect(store.getStatus().lastSuccessAt).toBeDefined();
		});

		test("uses defaultValue before startPolling is called", () => {
			const mockClient = createMockS3Client({
				getResponse: () => makeBody({ enabled: true, message: "from-s3" }),
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			expect(store.get()).toEqual(defaultConfig());
		});
	});

	describe("fail-open behavior", () => {
		test("returns defaultValue when S3 throws a network error", async () => {
			const mockClient = createMockS3Client({
				getResponse: () => {
					throw new Error("NetworkingError: socket hang up");
				},
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();

			expect(store.get()).toEqual(defaultConfig());
			expect(store.getStatus().healthy).toBe(false);
			expect(store.getStatus().error).toContain("NetworkingError");
		});

		test("returns defaultValue when S3 file does not exist (NoSuchKey)", async () => {
			const mockClient = createMockS3Client({
				getResponse: () => {
					throw makeNoSuchKeyError();
				},
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();

			expect(store.get()).toEqual(defaultConfig());
			expect(store.getStatus().healthy).toBe(true);
		});

		test("returns defaultValue when S3 body is malformed JSON", async () => {
			const mockClient = createMockS3Client({
				getResponse: () => ({
					Body: {
						transformToString: async () => "not-valid-json{{{",
					},
				}),
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();

			expect(store.get()).toEqual(defaultConfig());
			expect(store.getStatus().healthy).toBe(false);
		});

		test("returns defaultValue when S3 body is null", async () => {
			const mockClient = createMockS3Client({
				getResponse: () => ({ Body: null }),
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();

			expect(store.get()).toEqual(defaultConfig());
			expect(store.getStatus().healthy).toBe(true);
		});

		test("returns defaultValue when S3 body is empty string", async () => {
			const mockClient = createMockS3Client({
				getResponse: () => ({
					Body: { transformToString: async () => "   " },
				}),
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();

			expect(store.get()).toEqual(defaultConfig());
			expect(store.getStatus().healthy).toBe(true);
		});

		test("returns defaultValue when schema validation fails", async () => {
			const strictSchema = z.object({
				enabled: z.boolean(),
				message: z.string(),
				requiredField: z.string(),
			});

			const mockClient = createMockS3Client({
				getResponse: () =>
					makeBody({ enabled: true, message: "no-required-field" }),
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: strictSchema as unknown as z.ZodType<TestConfig>,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();

			expect(store.get()).toEqual(defaultConfig());
			expect(store.getStatus().healthy).toBe(false);
		});
	});

	describe("refresh", () => {
		test("updates cached config when S3 content changes", async () => {
			let callCount = 0;
			const mockClient = createMockS3Client({
				getResponse: () => {
					callCount++;
					if (callCount === 1) {
						return makeBody({ enabled: false, message: "first" });
					}
					return makeBody({ enabled: true, message: "second" });
				},
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();
			expect(store.get().message).toBe("first");

			await store.refresh();
			expect(store.get().message).toBe("second");
			expect(store.get().enabled).toBe(true);
		});
	});

	describe("writeToSource", () => {
		test("updates local cache immediately after write", async () => {
			const mockClient = createMockS3Client({
				getResponse: () => makeBody(defaultConfig()),
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();
			expect(store.get().enabled).toBe(false);

			await store.writeToSource({
				config: { enabled: true, message: "written" },
			});

			expect(store.get()).toEqual({ enabled: true, message: "written" });
			expect(store.getStatus().healthy).toBe(true);
		});

		test("calls S3 PutObject with correct payload", async () => {
			const mockClient = createMockS3Client({
				getResponse: () => makeBody(defaultConfig()),
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.writeToSource({
				config: { enabled: true, message: "test-write" },
			});

			const sendFn = (
				mockClient as unknown as { send: ReturnType<typeof jest.fn> }
			).send;
			const calls = sendFn.mock.calls;
			const lastCall = calls[calls.length - 1]?.[0];
			expect(lastCall?.constructor?.name).toBe("PutObjectCommand");
		});
	});

	describe("readFromSource", () => {
		test("returns fresh data from S3 without updating cache", async () => {
			let callCount = 0;
			const mockClient = createMockS3Client({
				getResponse: () => {
					callCount++;
					return makeBody({
						enabled: callCount > 1,
						message: `call-${callCount}`,
					});
				},
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				s3Client: mockClient,
			});

			await store.startPolling();
			expect(store.get().message).toBe("call-1");

			const fresh = await store.readFromSource();
			expect(fresh.message).toBe("call-2");
			expect(store.get().message).toBe("call-1");
		});
	});

	describe("polling lifecycle", () => {
		test("double startPolling does not create a second interval", async () => {
			let callCount = 0;
			const mockClient = createMockS3Client({
				getResponse: () => {
					callCount++;
					return makeBody(defaultConfig());
				},
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				pollIntervalMs: 50,
				s3Client: mockClient,
			});

			await store.startPolling();
			await store.startPolling();

			const countAfterStart = callCount;

			await new Promise((resolve) => setTimeout(resolve, 130));

			const countAfterWait = callCount;
			const intervalFetchCount = countAfterWait - countAfterStart;

			expect(intervalFetchCount).toBeGreaterThanOrEqual(1);
			expect(intervalFetchCount).toBeLessThanOrEqual(3);
		});

		test("stopPolling prevents further refreshes", async () => {
			let callCount = 0;
			const mockClient = createMockS3Client({
				getResponse: () => {
					callCount++;
					return makeBody(defaultConfig());
				},
			});

			store = createEdgeConfigStore<TestConfig>({
				s3Key: "admin/test-config.json",
				schema: TestConfigSchema,
				defaultValue: defaultConfig,
				pollIntervalMs: 50,
				s3Client: mockClient,
			});

			await store.startPolling();
			store.stopPolling();

			const countAfterStop = callCount;
			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(callCount).toBe(countAfterStop);
		});
	});
});
