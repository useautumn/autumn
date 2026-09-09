import { generateAuthToken } from "aws-msk-iam-sasl-signer-js";
import type { OauthbearerProviderResponse } from "kafkajs";
import type { KafkaTransportConfig } from "./types/kafkaClient.js";

export function createKafkaTransport({
	authMode,
	region,
	generateToken = generateAuthToken,
}: {
	authMode: "none" | "msk_iam";
	region?: string;
	generateToken?: typeof generateAuthToken;
}): KafkaTransportConfig {
	if (authMode === "none") return {};
	if (authMode !== "msk_iam") {
		throw new Error("Unsupported Kafka authentication mode");
	}
	const signingRegion = region?.trim() ?? "";
	if (!signingRegion)
		throw new Error("MSK IAM authentication requires a region");

	async function oauthBearerProvider(): Promise<OauthbearerProviderResponse> {
		// KafkaJS calls this again on reauthentication; never capture a startup token.
		const { token } = await generateToken({ region: signingRegion });
		return { value: token };
	}

	return {
		ssl: true,
		sasl: { mechanism: "oauthbearer", oauthBearerProvider },
	};
}
