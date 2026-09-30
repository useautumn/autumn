import { generateAuthToken } from "aws-msk-iam-sasl-signer-js";
import type { OauthbearerProviderResponse } from "kafkajs";
import { describeMskToken, type KafkaTokenInfo } from "./mskTokenInfo.js";
import type { KafkaTransportConfig } from "./types/kafkaClient.js";

export function createKafkaTransport({
	authMode,
	region,
	generateToken = generateAuthToken,
	onToken,
}: {
	authMode: "none" | "msk_iam";
	region?: string;
	generateToken?: typeof generateAuthToken;
	/** Told about every token signed, so a refusal can be read against the key and lifetime the client presented. */
	onToken?(info: KafkaTokenInfo): void;
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
		const { token, expiryTime } = await generateToken({
			region: signingRegion,
		});
		if (onToken) {
			try {
				onToken(describeMskToken({ token, expiryTime }));
			} catch {
				// Telemetry must never fail an authentication.
			}
		}
		return { value: token };
	}

	return {
		ssl: true,
		sasl: { mechanism: "oauthbearer", oauthBearerProvider },
	};
}
