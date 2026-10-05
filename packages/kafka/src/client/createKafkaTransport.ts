import { generateAuthToken } from "aws-msk-iam-sasl-signer-js";
import type { OauthbearerProviderResponse } from "kafkajs";
import {
	type KafkaTokenRecord,
	processKafkaTokens,
	writeKafkaTokenLine,
} from "./kafkaTokens.js";
import { describeMskToken, type KafkaTokenInfo } from "./mskTokenInfo.js";
import type {
	KafkaScramCredentials,
	KafkaTransportConfig,
} from "./types/kafkaClient.js";

export function createKafkaTransport({
	authMode,
	region,
	scram,
	generateToken = generateAuthToken,
	onToken = writeKafkaTokenLine,
	tokens = processKafkaTokens,
	now = Date.now,
}: {
	authMode: "none" | "msk_iam" | "scram";
	region?: string;
	scram?: KafkaScramCredentials;
	generateToken?: typeof generateAuthToken;
	/** Told about every token signed, so a refusal can be read against the key and lifetime the client presented. */
	onToken?(info: KafkaTokenInfo): void;
	tokens?: KafkaTokenRecord;
	now?: () => number;
}): KafkaTransportConfig {
	if (authMode === "none") return {};
	if (authMode === "scram") return createScramTransport({ scram });
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

function createScramTransport({
	scram,
}: {
	scram?: KafkaScramCredentials;
}): KafkaTransportConfig {
	if (!scram?.username.trim() || !scram.password) {
		throw new Error("SCRAM authentication requires a username and password");
	}
	const { username, password } = scram;
	if (scram.mechanism === "scram-sha-512") {
		return {
			ssl: true,
			sasl: { mechanism: "scram-sha-512", username, password },
		};
	}
	return {
		ssl: true,
		sasl: { mechanism: "scram-sha-256", username, password },
	};
}
