import { afterEach, expect, setSystemTime, test } from "bun:test";
import { createRequire } from "node:module";

// MSK periodically forgets a connection's authenticated session and refuses
// everything on it as unauthorized until kafkajs re-authenticates on its own
// timer, up to 290s later. Patched in patches/kafkajs@2.2.4.patch to
// re-authenticate the moment a broker refuses a session, and to send the
// refused request once more on the new one.
const require = createRequire(import.meta.resolve("kafkajs"));
const Connection = require("./src/network/connection.js");
const Encoder = require("./src/protocol/encoder.js");
const sharedPromiseTo = require("./src/utils/sharedPromiseTo.js");
const { createErrorFromCode } = require("./src/protocol/error.js");
const apiKeys = require("./src/protocol/requests/apiKeys.js");

const TOPIC_AUTHORIZATION_FAILED = 29;
const NOT_LEADER_FOR_PARTITION = 6;

type Session = [number, number] | null;
type Answer = { errorCode: number; topics?: TopicAnswer[] };
type TopicAnswer = { topicName: string; partitions: { errorCode: number }[] };
type Warning = { message: string; extra: Record<string, unknown> };

afterEach(() => {
	setSystemTime();
});

function createFixture({ sasl = true }: { sasl?: boolean } = {}) {
	const warnings: Warning[] = [];
	const sent: string[] = [];
	const dropped = new Set<Session>();
	const broker = {
		authentications: 0,
		refuseEveryone: false,
		answerProduce: null as TopicAnswer[] | null,
		otherError: null as number | null,
	};
	const logger = {
		namespace: () => ({
			debug() {},
			info() {},
			error() {},
			warn(message: string, extra: Record<string, unknown>) {
				warnings.push({ message, extra });
			},
		}),
	};
	const connection = new Connection({
		host: "b-1.metering.example",
		port: 9098,
		logger,
		socketFactory: () => {
			throw new Error("no socket in this test");
		},
		requestTimeout: 30_000,
		connectionTimeout: 1_000,
		sasl: sasl ? { mechanism: "oauthbearer" } : null,
		clientId: "test",
	});
	connection.connectionStatus = "connected";
	connection.authenticatedAt = sasl ? process.hrtime() : null;

	const authenticate = Object.getOwnPropertySymbols(connection).find(
		(symbol) => symbol.description === "private:Connection:authenticate",
	);
	if (!authenticate) throw new Error("kafkajs authenticate hook not found");
	connection[authenticate] = sharedPromiseTo(async () => {
		if (!connection.sasl) return;
		await Promise.resolve();
		broker.authentications += 1;
		connection.authenticatedAt = process.hrtime();
	});

	connection.requestQueue.push = ({
		entry,
	}: {
		entry: {
			apiName: string;
			correlationId: number;
			resolve: (v: unknown) => void;
		};
	}) => {
		sent.push(entry.apiName);
		const session: Session = connection.authenticatedAt;
		const answer = answerFor({ apiName: entry.apiName, session });
		entry.resolve({
			correlationId: entry.correlationId,
			size: 0,
			entry,
			payload: answer,
		});
	};

	function answerFor({
		apiName,
		session,
	}: {
		apiName: string;
		session: Session;
	}): Answer {
		if (broker.otherError !== null) return { errorCode: broker.otherError };
		const refused = broker.refuseEveryone || dropped.has(session);
		if (apiName === "Produce" && broker.answerProduce)
			return {
				errorCode: TOPIC_AUTHORIZATION_FAILED,
				topics: broker.answerProduce,
			};
		if (!refused) return { errorCode: 0 };
		if (apiName !== "Produce") return { errorCode: TOPIC_AUTHORIZATION_FAILED };
		return {
			errorCode: TOPIC_AUTHORIZATION_FAILED,
			topics: [
				{
					topicName: "events",
					partitions: [{ errorCode: TOPIC_AUTHORIZATION_FAILED }],
				},
			],
		};
	}

	function dropSessions(): void {
		dropped.add(connection.authenticatedAt);
	}

	function send(apiName: "Fetch" | "Produce"): Promise<unknown> {
		return connection.send({
			request: {
				apiKey: apiKeys[apiName],
				apiVersion: apiName === "Fetch" ? 11 : 7,
				apiName,
				encode: async () => new Encoder(),
			},
			response: {
				decode: async (answer: Answer) => answer,
				parse: async (answer: Answer) => {
					if (answer.errorCode !== 0)
						throw createErrorFromCode(answer.errorCode);
					return "ok";
				},
			},
		});
	}

	return { broker, connection, dropSessions, send, sent, warnings };
}

test("a request refused on a session the broker dropped re-authenticates the connection and succeeds", async () => {
	const { broker, dropSessions, send, sent, warnings } = createFixture();
	dropSessions();

	await expect(send("Fetch")).resolves.toBe("ok");

	expect(broker.authentications).toBe(1);
	expect(sent).toEqual(["Fetch", "Fetch"]);
	expect(warnings).toHaveLength(1);
	expect(warnings[0]?.message).toBe(
		"Broker refused an authenticated session; re-authenticating",
	);
	expect(warnings[0]?.extra).toMatchObject({
		broker: "b-1.metering.example:9098",
		clientId: "test",
		apiName: "Fetch",
		error: "Not authorized to access topics: [Topic authorization failed]",
	});
});

test("requests in flight on a dropped session share one re-authentication", async () => {
	const { broker, dropSessions, send } = createFixture();
	dropSessions();

	const answers = await Promise.all([
		send("Fetch"),
		send("Fetch"),
		send("Fetch"),
	]);

	expect(answers).toEqual(["ok", "ok", "ok"]);
	expect(broker.authentications).toBe(1);
});

test("a refusal of a session just re-authenticated for a refusal is the broker's verdict, retried at most every ten seconds", async () => {
	setSystemTime(new Date("2026-10-04T20:00:00Z"));
	const { broker, send, sent } = createFixture();
	broker.refuseEveryone = true;

	await expect(send("Fetch")).rejects.toThrow(
		"Not authorized to access topics",
	);
	expect(broker.authentications).toBe(1);
	expect(sent).toHaveLength(2);

	await expect(send("Fetch")).rejects.toThrow(
		"Not authorized to access topics",
	);
	expect(broker.authentications).toBe(1);
	expect(sent).toHaveLength(3);

	setSystemTime(new Date("2026-10-04T20:00:10Z"));
	await expect(send("Fetch")).rejects.toThrow(
		"Not authorized to access topics",
	);
	expect(broker.authentications).toBe(2);
	expect(sent).toHaveLength(5);
});

test("a produce refused for every partition is sent again on the new session", async () => {
	const { broker, dropSessions, send, sent } = createFixture();
	dropSessions();

	await expect(send("Produce")).resolves.toBe("ok");

	expect(broker.authentications).toBe(1);
	expect(sent).toEqual(["Produce", "Produce"]);
});

test("a produce refused for only some of its partitions is the broker's verdict, not a dropped session", async () => {
	const { broker, send, sent, warnings } = createFixture();
	broker.answerProduce = [
		{
			topicName: "events",
			partitions: [{ errorCode: TOPIC_AUTHORIZATION_FAILED }],
		},
		{ topicName: "ownership", partitions: [{ errorCode: 0 }] },
	];

	await expect(send("Produce")).rejects.toThrow(
		"Not authorized to access topics",
	);

	expect(sent).toEqual(["Produce"]);
	expect(warnings).toHaveLength(0);
});

test("an error other than an authorization refusal is neither re-authenticated nor retried", async () => {
	const { broker, send, sent, warnings } = createFixture();
	broker.otherError = NOT_LEADER_FOR_PARTITION;

	await expect(send("Fetch")).rejects.toThrow();

	expect(broker.authentications).toBe(0);
	expect(sent).toEqual(["Fetch"]);
	expect(warnings).toHaveLength(0);
});

test("a connection without SASL passes a refusal straight through", async () => {
	const { broker, send, sent } = createFixture({ sasl: false });
	broker.refuseEveryone = true;

	await expect(send("Fetch")).rejects.toThrow(
		"Not authorized to access topics",
	);

	expect(broker.authentications).toBe(0);
	expect(sent).toEqual(["Fetch"]);
});
