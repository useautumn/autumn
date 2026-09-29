import { describe, expect, test } from "bun:test";
import { capyEnvFiles } from "./serverEnv.ts";

const { server } = capyEnvFiles({
	databaseUrl: "postgresql://user:pass@example.neon.tech/neondb",
	secrets: {
		betterAuthSecret: "secret",
		encryptionIv: "iv",
		encryptionPassword: "password",
	},
	triggerSecretKey: "tr_dev_x",
	triggerAccessToken: "tr_pat_x",
});

describe("capyEnvFiles", () => {
	test("points every Kafka client at the machine's plaintext broker", () => {
		expect(server.KAFKA_BROKERS).toBe("127.0.0.1:19092");
		expect(server.KAFKA_AUTH_MODE).toBe("none");
	});

	test("serves DynamoDB from fakecloud", () => {
		expect(server.DYNAMODB_ENDPOINT).toBe("http://localhost:4566");
	});
});
