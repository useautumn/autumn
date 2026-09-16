import { expect, spyOn, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import * as kafka from "@autumn/kafka";
import { createWorkerCheckpointConfig } from "../../../src/init/workerCheckpointConfig.js";
import { openWorkerResources } from "../../../src/init/workerResources.js";

test.each(["none", "msk_iam"] as const)(
	"worker resource opening passes %s transport to its shared Kafka client",
	async (authMode) => {
		const interrupted = new Error("stop before opening any connection");
		function interruptConnection(): never {
			throw interrupted;
		}
		const createClient = spyOn(kafka, "createKafkaClient").mockImplementation(
			interruptConnection,
		);
		const createTransport = spyOn(kafka, "createKafkaTransport");
		try {
			const env = createBalanceWorkerEnv({
				KAFKA_BROKERS: "broker:9098",
				KAFKA_AUTH_MODE: authMode,
				AWS_REGION: "us-east-1",
			});
			await expect(
				openWorkerResources({
					config: { env },
					checkpointConfig: createWorkerCheckpointConfig({ env }),
				}),
			).rejects.toBe(interrupted);
			expect(createTransport).toHaveBeenCalledWith({
				authMode,
				region: "us-east-1",
			});
			expect(createClient).toHaveBeenCalledTimes(1);
			expect(createClient.mock.calls[0]?.[0]).toMatchObject({
				brokers: ["broker:9098"],
				limits: {
					connectionTimeoutMs: 5000,
					requestTimeoutMs: 30000,
					retryCount: 2,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 1000,
				},
			});
			expect(createClient.mock.calls[0]?.[0].transport).toEqual(
				authMode === "none"
					? {}
					: {
							ssl: true,
							sasl: {
								mechanism: "oauthbearer",
								oauthBearerProvider: expect.any(Function),
							},
						},
			);
		} finally {
			createTransport.mockRestore();
			createClient.mockRestore();
		}
	},
);
