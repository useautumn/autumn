import { describe, expect, jest, mock, test } from "bun:test";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

mock.module("../../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

const TURN_MS = 220_000;

await mockLeafModule({
	specifier: "../../../../src/providers/slack/setup/setupSlackAgentTurn.js",
	factory: () => ({
		setupSlackAgentTurn: async () => ({
			context: { env: "live" },
			installation: {},
			kind: "ready",
			org: { id: "org_1" },
			params: { text: "list open invoices" },
		}),
	}),
});

await mockLeafModule({
	specifier:
		"../../../../src/internal/agentRuntime/actions/runAgentTurn/runAgentTurn.js",
	factory: () => ({
		runAgentTurn: () =>
			new Promise((resolve) =>
				setTimeout(
					() => resolve({ kind: "reply", text: "Here are the open invoices." }),
					TURN_MS,
				),
			),
	}),
});

const { runSlackAgentTurn } = await import(
	"../../../../src/providers/slack/actions/runSlackAgentTurn.js"
);

describe("runSlackAgentTurn", () => {
	test("delivers the reply of a turn that runs past the settle budget", async () => {
		jest.useFakeTimers();
		const settled = runSlackAgentTurn({ text: "list open invoices" } as never);
		const outcome = settled.then(
			(result) => ({ result }),
			(error: Error) => ({ error: error.message }),
		);

		for (let elapsed = 0; elapsed < TURN_MS; elapsed += 1_000) {
			await Promise.resolve();
			jest.advanceTimersByTime(1_000);
		}

		jest.useRealTimers();
		expect(await outcome).toEqual({
			result: expect.objectContaining({
				kind: "reply",
				text: "Here are the open invoices.",
			}),
		});
	});
});
