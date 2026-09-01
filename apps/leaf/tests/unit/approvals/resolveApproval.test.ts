import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

const repoCalls: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			finalize: async () => {
				repoCalls.push("finalize");
			},
			release: async () => {
				repoCalls.push("release");
			},
		},
	}),
});

let driftBehavior: () => Promise<unknown> = async () => undefined;
await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/guardApprovalDrift.js",
	factory: () => ({
		guardApprovalDrift: () => driftBehavior(),
	}),
});

const executorCalls: string[] = [];
let executorBehavior: () => Promise<unknown> = async () => ({
	result: {},
	text: "",
	writes: [],
});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/executeApprovalWrites.js",
	factory: () => ({
		executeApprovalWrites: ({ approval }: { approval: ChatApproval }) => {
			executorCalls.push(approval.id);
			return executorBehavior();
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/lib/logger.js",
	factory: () => ({
		logger: { error: () => {}, info: () => {}, warn: () => {} },
	}),
});

const { resolveApproval } = await import(
	"../../../src/internal/approvals/actions/resolveApproval.js"
);

const approval = (overrides: Partial<ChatApproval> = {}) =>
	({
		env: AppEnv.Sandbox,
		harness: "eve",
		id: "a_1",
		org_id: "org_1",
		provider: "slack",
		run_id: "eve_session_1",
		tool_call_id: "tc_1",
		tool_name: "autumn__attach",
		...overrides,
	}) as unknown as ChatApproval;

beforeEach(() => {
	repoCalls.length = 0;
	executorCalls.length = 0;
	driftBehavior = async () => undefined;
	executorBehavior = async () => ({ result: {}, text: "", writes: [] });
});

describe("resolveApproval executes stored writes", () => {
	test("a clean guard runs the executor and returns its result", async () => {
		executorBehavior = async () => ({
			result: {},
			text: "",
			toolName: "autumn__attach",
			writes: [{ status: "applied", toolName: "autumn__attach" }],
		});

		const result = await resolveApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(executorCalls).toEqual(["a_1"]);
		expect(result).toMatchObject({
			writes: [{ status: "applied", toolName: "autumn__attach" }],
		});
	});

	test("an executor throw releases the claim retryably", async () => {
		executorBehavior = async () => {
			throw new Error("autumn api unavailable");
		};

		const result = await resolveApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true, retryable: true });
		expect(repoCalls).toEqual(["release"]);
	});
});

describe("resolveApproval drift guard", () => {
	test("a drifted card returns without executing", async () => {
		driftBehavior = async () => ({ drifted: true, message: "drifted" });

		const result = await resolveApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ drifted: true });
		expect(executorCalls).toEqual([]);
		expect(repoCalls).toEqual([]);
	});

	test("a thrown guard releases the claim retryably", async () => {
		driftBehavior = async () => {
			throw new Error("preview fetch failed");
		};

		const result = await resolveApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true, retryable: true });
		expect(executorCalls).toEqual([]);
		expect(repoCalls).toEqual(["release"]);
	});

	test("the dashboard surface skips the guard", async () => {
		let guarded = false;
		driftBehavior = async () => {
			guarded = true;
			return undefined;
		};

		const result = await resolveApproval({
			approval: approval({ provider: "web" } as Partial<ChatApproval>),
			providerUserId: "U1",
		});

		expect(guarded).toBe(false);
		expect(result).toMatchObject({ result: {} });
	});
});

describe("resolveApproval legacy harness", () => {
	test("a non-eve harness fails without executing", async () => {
		const result = await resolveApproval({
			approval: approval({ harness: "mastra" } as Partial<ChatApproval>),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true });
		expect(executorCalls).toEqual([]);
	});
});
