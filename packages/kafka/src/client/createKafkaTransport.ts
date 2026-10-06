import { generateAuthToken } from "aws-msk-iam-sasl-signer-js";
import type { OauthbearerProviderResponse } from "kafkajs";
import {
	type KafkaTokenRecord,
	processKafkaTokens,
	writeKafkaTokenLine,
} from "./kafkaTokens.js";
import { describeMskToken, type KafkaTokenInfo } from "./mskTokenInfo.js";
import type {
	KafkaSaslCredentials,
	KafkaTransportConfig,
} from "./types/kafkaClient.js";

export function createKafkaTransport({
	authMode,
	region,
	sasl,
	generateToken = generateAuthToken,
	onToken = writeKafkaTokenLine,
	tokens = processKafkaTokens,
	now = Date.now,
}: {
	authMode: "none" | "msk_iam" | "scram" | "plain";
	region?: string;
	sasl?: KafkaSaslCredentials;
	generateToken?: typeof generateAuthToken;
	/** Told about every token signed, so a refusal can be read against the key and lifetime the client presented. */
	onToken?(info: KafkaTokenInfo): void;
	tokens?: KafkaTokenRecord;
	now?: () => number;
}): KafkaTransportConfig {
	if (authMode === "none") return {};
	if (authMode === "scram" || authMode === "plain")
		return createSaslTransport({ sasl });
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
		try {
			const info = describeMskToken({ token, expiryTime });
			tokens.record({ info, at: now() });
			onToken(info);
		} catch {
			// Telemetry must never fail an authentication.
		}
		return { value: token };
	}

	return {
		ssl: true,
		sasl: { mechanism: "oauthbearer", oauthBearerProvider },
	};
}

function createSaslTransport({
	sasl,
}: {
	sasl?: KafkaSaslCredentials;
}): KafkaTransportConfig {
	if (!sasl?.username.trim() || !sasl.password) {
		throw new Error("SASL authentication requires a username and password");
	}
	const { username, password } = sasl;
	switch (sasl.mechanism) {
		case "plain":
			return { ssl: true, sasl: { mechanism: "plain", username, password } };
		case "scram-sha-512":
			return {
				ssl: true,
				sasl: { mechanism: "scram-sha-512", username, password },
			};
		case "scram-sha-256":
			return {
				ssl: true,
				sasl: { mechanism: "scram-sha-256", username, password },
			};
	}
}
