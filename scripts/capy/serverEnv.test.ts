import { describe, expect, test } from "bun:test";
import { capyEnvFiles } from "./serverEnv.ts";

const { server } = capyEnvFiles({
	machineId: "capy-binding-a",
	databaseUrl: "postgresql://user:pass@example.neon.tech/neondb",
	secrets: {
		betterAuthSecret: "secret",
		encryptionIv: "iv",
		encryptionPassword: "password",
	},
	trigger: { secretKey: "tr_dev_x", accessToken: "tr_pat_x" },
});

describe("capyEnvFiles", () => {
	test("points every Kafka client at the machine's plaintext broker", () => {
		expect(server.KAFKA_BROKERS).toBe("127.0.0.1:19092");
		expect(server.KAFKA_AUTH_MODE).toBe("none");
	});

	test("stamps the machine the files were provisioned for", () => {
		expect(server.CAPY_MACHINE_ID).toBe("capy-binding-a");
	});

	test("serves DynamoDB from fakecloud", () => {
		expect(server.DYNAMODB_ENDPOINT).toBe("http://localhost:4566");
	});

	test("blanks Trigger keys when Trigger.dev is not opted in", () => {
		const { server: slim } = capyEnvFiles({
			machineId: "capy-binding-a",
			databaseUrl: "postgresql://user:pass@example.neon.tech/neondb",
			secrets: {
				betterAuthSecret: "s",
				encryptionIv: "iv",
				encryptionPassword: "p",
			},
		});
		expect(slim.TRIGGER_SERVER_SECRET_KEY).toBe("");
		expect(slim.TRIGGER_API_URL).toBe("");
	});
});
