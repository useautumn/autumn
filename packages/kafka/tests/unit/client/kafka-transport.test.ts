import { expect, spyOn, test } from "bun:test";
import {
	type GenerateAuthTokenOptions,
	generateAuthTokenFromCredentialsProvider,
} from "aws-msk-iam-sasl-signer-js";
import { createKafkaTransport } from "../../../src/client/createKafkaTransport.js";
import {
	createKafkaTokenRecord,
	describeKafkaToken,
} from "../../../src/client/kafkaTokens.js";
import type { KafkaTransportConfig } from "../../../src/client/types/kafkaClient.js";

function tokenProviderOf({ transport }: { transport: KafkaTransportConfig }) {
	const sasl = transport.sasl;
	if (!sasl || !("oauthBearerProvider" in sasl)) {
		throw new Error("Expected an OAuthBearer token provider");
	}
	return sasl.oauthBearerProvider;
}

test("local transport never resolves AWS credentials", () => {
	let calls = 0;
	async function generateToken(): Promise<never> {
		calls++;
		throw new Error("AWS credentials must not be needed for local Kafka");
	}
	for (const region of [undefined, "", "us-east-1"]) {
		expect(
			createKafkaTransport({ authMode: "none", region, generateToken }),
		).toEqual({});
	}
	expect(calls).toBe(0);
});

test("SCRAM uses TLS with its credentials and never signs an IAM token", () => {
	let calls = 0;
	async function generateToken(): Promise<never> {
		calls++;
		throw new Error("SCRAM must not sign an IAM token");
	}
	const scram = {
		mechanism: "scram-sha-256" as const,
		username: "tf-redpanda-staging-server",
		password: "secret",
	};
	expect(
		createKafkaTransport({ authMode: "scram", scram, generateToken }),
	).toEqual({ ssl: true, sasl: scram });
	expect(calls).toBe(0);
});

test("SCRAM without a username and password is refused", () => {
	expect(() => createKafkaTransport({ authMode: "scram" })).toThrow(
		"SCRAM authentication requires a username and password",
	);
	expect(() =>
		createKafkaTransport({
			authMode: "scram",
			scram: { mechanism: "scram-sha-512", username: "", password: "secret" },
		}),
	).toThrow("SCRAM authentication requires a username and password");
});

test("IAM uses TLS and signs lazily for every authentication", async () => {
	const requests: GenerateAuthTokenOptions[] = [];
	async function generateToken(options: GenerateAuthTokenOptions) {
		requests.push(options);
		return {
			token: `token-${requests.length}`,
			expiryTime: Date.now() + 60_000,
		};
	}
	const transport = createKafkaTransport({
		authMode: "msk_iam",
		region: " us-east-1 ",
		generateToken,
	});
	expect(transport).toEqual({
		ssl: true,
		sasl: {
			mechanism: "oauthbearer",
			oauthBearerProvider: expect.any(Function),
		},
	});
	expect(requests).toEqual([]);
	const authenticate = tokenProviderOf({ transport });
	expect(await authenticate()).toEqual({ value: "token-1" });
	expect(await authenticate()).toEqual({ value: "token-2" });
	expect(requests).toEqual([{ region: "us-east-1" }, { region: "us-east-1" }]);
});

test("signer failure propagates without retries or plaintext fallback", async () => {
	const failure = new Error("credentials unavailable");
	let unavailable = true;
	let calls = 0;
	async function generateToken() {
		calls++;
		if (unavailable) throw failure;
		return { token: "recovered-token", expiryTime: Date.now() + 60_000 };
	}
	const transport = createKafkaTransport({
		authMode: "msk_iam",
		region: "us-east-1",
		generateToken,
	});
	const authenticate = tokenProviderOf({ transport });
	await expect(authenticate()).rejects.toBe(failure);
	expect(calls).toBe(1);
	expect(transport.ssl).toBe(true);
	expect(transport.sasl?.mechanism).toBe("oauthbearer");
	unavailable = false;
	expect(await authenticate()).toEqual({ value: "recovered-token" });
	expect(calls).toBe(2);
});

test.each([undefined, "", " "])(
	"IAM transport rejects a missing signing region: %j",
	(region) => {
		expect(() => createKafkaTransport({ authMode: "msk_iam", region })).toThrow(
			"requires a region",
		);
	},
);

test("the AWS signer works under Bun with rotating synthetic credentials", async () => {
	let credentialReads = 0;
	async function awsCredentialsProvider() {
		credentialReads++;
		return {
			accessKeyId: "example",
			secretAccessKey: "example-secret",
			sessionToken: `session-${credentialReads}`,
		};
	}
	async function generateToken(options: GenerateAuthTokenOptions) {
		return await generateAuthTokenFromCredentialsProvider({
			...options,
			awsCredentialsProvider,
		});
	}
	const authenticate = tokenProviderOf({
		transport: createKafkaTransport({
			authMode: "msk_iam",
			region: "us-east-1",
			generateToken,
		}),
	});
	for (const session of [1, 2]) {
		const { value } = await authenticate();
		const signed = new URL(Buffer.from(value, "base64url").toString("utf8"));
		expect(signed.origin).toBe("https://kafka.us-east-1.amazonaws.com");
		expect(signed.searchParams.get("Action")).toBe("kafka-cluster:Connect");
		expect(signed.searchParams.get("X-Amz-Credential")).toMatch(
			/^example\/\d{8}\/us-east-1\/kafka-cluster\/aws4_request$/,
		);
		expect(signed.searchParams.get("X-Amz-Security-Token")).toBe(
			`session-${session}`,
		);
		expect(signed.searchParams.get("X-Amz-Signature")).toMatch(
			/^[a-f0-9]{64}$/,
		);
	}
	expect(credentialReads).toBe(2);
});

function presignedToken({ keyId }: { keyId: string }): string {
	const url = `https://kafka.us-east-2.amazonaws.com/?Action=kafka-cluster%3AConnect&X-Amz-Credential=${keyId}%2F20261002%2Fus-east-2%2Fkafka-cluster%2Faws4_request&X-Amz-Date=20261002T040100Z&X-Amz-Expires=900`;
	return Buffer.from(url).toString("base64url");
}

test("every token signed is recorded for the process, and the caller is still told", async () => {
	const tokens = createKafkaTokenRecord();
	const told: string[] = [];
	let signed = 0;
	const transport = createKafkaTransport({
		authMode: "msk_iam",
		region: "us-east-2",
		tokens,
		now: () => Date.parse("2026-10-02T04:01:00.000Z"),
		generateToken: async () => {
			signed++;
			return {
				token: presignedToken({ keyId: `AKIAEXAMPLE000${signed}KEY` }),
				expiryTime: Date.parse("2026-10-02T04:16:00.000Z"),
			};
		},
		onToken: (info) => {
			told.push(info.keyIdSuffix ?? "?");
		},
	});
	const authenticate = tokenProviderOf({ transport });
	await authenticate();
	await authenticate();

	expect(told).toEqual(["01KEY", "02KEY"]);
	expect(
		describeKafkaToken({
			record: tokens,
			now: Date.parse("2026-10-02T04:20:00.000Z"),
		}),
	).toEqual({
		keyIdSuffix: "02KEY",
		signedAt: "2026-10-02T04:01:00.000Z",
		expiresAt: "2026-10-02T04:16:00.000Z",
		ttlSeconds: 900,
		secondsSinceSigned: 1140,
		expired: true,
		tokensSigned: 2,
	});
});

test("a process that signed no token yet has none to describe", () => {
	expect(
		describeKafkaToken({ record: createKafkaTokenRecord(), now: 0 }),
	).toBeNull();
});

test("without a caller to tell, the transport writes each token as its own line", async () => {
	const lines: string[] = [];
	const info = spyOn(console, "info").mockImplementation((line: string) => {
		lines.push(line);
	});
	try {
		const transport = createKafkaTransport({
			authMode: "msk_iam",
			region: "us-east-2",
			tokens: createKafkaTokenRecord(),
			generateToken: async () => ({
				token: presignedToken({ keyId: "AKIAEXAMPLEKB2VR" }),
				expiryTime: Date.parse("2026-10-02T04:16:00.000Z"),
			}),
		});
		await tokenProviderOf({ transport })();
	} finally {
		info.mockRestore();
	}
	expect(lines).toHaveLength(1);
	expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
		level: "INFO",
		event: "kafka.token_signed",
		kafkaToken: {
			keyIdSuffix: "KB2VR",
			expiresAt: "2026-10-02T04:16:00.000Z",
			ttlSeconds: 900,
		},
	});
});
