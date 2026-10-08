import { expect, test } from "bun:test";
import { nativeClientConfigOf } from "../../../src/client/librdkafka/nativeClientConfig.js";

type RefreshCallback = (
	config: unknown,
	done: (error: Error | null, token?: unknown) => void,
) => unknown;

function refreshCallbackOf(
	provider: () => Promise<{ value: string; lifetimeMs?: number }>,
): RefreshCallback {
	const config = nativeClientConfigOf({
		config: {
			clientId: "c",
			brokers: ["b:9098"],
			ssl: true,
			sasl: { mechanism: "oauthbearer", oauthBearerProvider: provider },
			connectionTimeout: 1_000,
			requestTimeout: 1_000,
			retry: { retries: 1, initialRetryTime: 1, maxRetryTime: 1 },
		},
	});
	return config.oauthbearer_token_refresh_cb as RefreshCallback;
}

// The client treats a returned promise as the token itself, so the callback must answer through `done` alone.
test("an OAuth token refresh answers through its callback once and returns nothing the client could read as a token", async () => {
	const refresh = refreshCallbackOf(async () => ({
		value: "signed",
		lifetimeMs: 123,
	}));
	const answers: unknown[] = [];
	const returned = refresh({}, (error, token) =>
		answers.push({ error, token }),
	);
	expect(returned).toBeUndefined();
	await Bun.sleep(1);
	expect(answers).toEqual([
		{
			error: null,
			token: { tokenValue: "signed", lifetime: 123, principal: "autumn" },
		},
	]);
});

test("a provider that fails is answered as a refresh failure", async () => {
	const refresh = refreshCallbackOf(async () => {
		throw new Error("no credentials");
	});
	const answers: (Error | null)[] = [];
	refresh({}, (error) => answers.push(error));
	await Bun.sleep(1);
	expect(answers.map((error) => error?.message)).toEqual(["no credentials"]);
});
