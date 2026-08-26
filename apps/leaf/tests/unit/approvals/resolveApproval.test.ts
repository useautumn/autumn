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

let resumeBehavior: () => Promise<unknown> = async () => ({});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/resumeApproval.js",
	factory: () => ({
		resumeApproval: () => resumeBehavior(),
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
let executorBehavior: () => Promise<unknown> = async () => undefined;
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
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		deleteEveSession: async () => {},
		getEveSessionBySessionId: async () => undefined,
	}),
});

await mockLeafModule({
	specifier: "../../../src/lib/logger.js",
	factory: () => ({
		logger: { error: () => {}, info: () => {}, warn: () => {} },
	}),
});

const { EveSessionGoneError } = await import(
	"../../../src/internal/agentRuntime/eve/client.js"
);
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
		tool_name: "autumn__attach",
		...overrides,
	}) as unknown as ChatApproval;

beforeEach(() => {
	repoCalls.length = 0;
	executorCalls.length = 0;
	resumeBehavior = async () => ({ result: {}, text: "", writes: [] });
	driftBehavior = async () => undefined;
	executorBehavior = async () => undefined;
});

// Claiming moves the row pending→running. A retryable failure deliberately
// skips finalize so the user can retry — but without releasing the claim the
// row stays running forever and the card can never be clicked again.
describe("resolveApproval releases the claim it could not finalize", () => {
	test("returns the row to pending when the resume fails retryably", async () => {
		resumeBehavior = async () => {
			throw new Error("eve stream disconnected");
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
	test("a drifted card returns without resuming or finalizing", async () => {
		driftBehavior = async () => ({ drifted: true, message: "drifted" });
		let resumed = false;
		resumeBehavior = async () => {
			resumed = true;
			return {};
		};

		const result = await resolveApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ drifted: true });
		expect(resumed).toBe(false);
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

describe("resolveApproval dead-session fallback", () => {
	test("a gone session executes the stored writes deterministically", async () => {
		resumeBehavior = async () => {
			throw new EveSessionGoneError("session gone");
		};
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
		expect(repoCalls).toEqual([]);
	});

	test("a gone session without stored writes finalizes failed", async () => {
		resumeBehavior = async () => {
			throw new EveSessionGoneError("session gone");
		};

		const result = await resolveApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(executorCalls).toEqual(["a_1"]);
		expect(result).toMatchObject({ error: true, retryable: false });
		expect(repoCalls).toEqual(["finalize"]);
	});

	test("the dashboard surface never executes the group", async () => {
		resumeBehavior = async () => {
			throw new EveSessionGoneError("session gone");
		};
		executorBehavior = async () => ({ result: {}, text: "", writes: [] });

		const result = await resolveApproval({
			approval: approval({ provider: "web" } as Partial<ChatApproval>),
			providerUserId: "U1",
		});

		expect(executorCalls).toEqual([]);
		expect(result).toMatchObject({ error: true, retryable: false });
		expect(repoCalls).toEqual(["finalize"]);
	});
});
