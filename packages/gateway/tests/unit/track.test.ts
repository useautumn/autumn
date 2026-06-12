import { describe, expect, test } from "bun:test";
import {
	type TrackTokensParams,
	trackTokenUsage,
} from "../../src/shared/track.js";

const params: TrackTokensParams = {
	inputTokens: 10,
	outputTokens: 5,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
	reasoningTokens: 0,
	audioInputTokens: 0,
	customerId: "cus_123",
	modelId: "openrouter/openai/gpt-4o",
};

describe("trackTokenUsage client shapes", () => {
	test("calls root-level trackTokens bound to the client (current @useautumn/sdk)", async () => {
		const calls: TrackTokensParams[] = [];

		// Class instance so an unbound invocation would lose `this` and throw.
		class FakeSdk {
			private readonly sink = calls;
			async trackTokens(p: TrackTokensParams) {
				this.sink.push(p);
			}
		}

		await trackTokenUsage({
			autumn: new FakeSdk(),
			getParams: () => params,
		});

		expect(calls).toEqual([params]);
	});

	test("prefers balances.trackTokens when present, bound to balances", async () => {
		const calls: string[] = [];

		class Balances {
			private readonly name = "balances";
			async trackTokens(_p: TrackTokensParams) {
				calls.push(this.name);
			}
		}

		await trackTokenUsage({
			autumn: {
				balances: new Balances(),
				trackTokens: async () => {
					calls.push("root");
				},
			},
			getParams: () => params,
		});

		expect(calls).toEqual(["balances"]);
	});

	test("a client with neither shape logs and never throws", async () => {
		await expect(
			trackTokenUsage({ autumn: {}, getParams: () => params }),
		).resolves.toBeUndefined();
	});
});
