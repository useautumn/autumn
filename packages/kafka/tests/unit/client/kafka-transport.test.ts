import { expect, test } from "bun:test";
import {
	type GenerateAuthTokenOptions,
	generateAuthTokenFromCredentialsProvider,
} from "aws-msk-iam-sasl-signer-js";
import { createKafkaTransport } from "../../../src/client/createKafkaTransport.js";
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
