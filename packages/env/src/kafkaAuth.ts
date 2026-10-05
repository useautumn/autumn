const SCRAM_MECHANISMS = ["scram-sha-256", "scram-sha-512"] as const;
type ScramMechanism = (typeof SCRAM_MECHANISMS)[number];

export type KafkaServiceUser = "SERVER" | "HERALD" | "BALANCE_WORKER";

export function createKafkaAuthEnv({
	runtimeEnv,
	serviceUser,
}: {
	runtimeEnv: Record<string, string | undefined>;
	serviceUser: KafkaServiceUser;
}) {
	// Staging and production use MSK IAM without an Infisical auth-mode setting.
	// Local plaintext Kafka and tests must explicitly opt into "none".
	const authMode = runtimeEnv.KAFKA_AUTH_MODE ?? "msk_iam";
	if (authMode !== "none" && authMode !== "msk_iam" && authMode !== "scram") {
		throw new Error("KAFKA_AUTH_MODE must be none, msk_iam or scram");
	}
	const region = runtimeEnv.AWS_REGION?.trim() || undefined;
	if (authMode === "msk_iam" && !region) {
		throw new Error("KAFKA_AUTH_MODE=msk_iam requires AWS_REGION");
	}
	return {
		KAFKA_AUTH_MODE: authMode,
		AWS_REGION: region,
		KAFKA_SCRAM:
			authMode === "scram"
				? readScramCredentials({ runtimeEnv, serviceUser })
				: undefined,
	} as const;
}

function readScramCredentials({
	runtimeEnv,
	serviceUser,
}: {
	runtimeEnv: Record<string, string | undefined>;
	serviceUser: KafkaServiceUser;
}) {
	const mechanism = runtimeEnv.KAFKA_SASL_MECHANISM ?? "scram-sha-256";
	if (!isScramMechanism(mechanism)) {
		throw new Error(
			"KAFKA_SASL_MECHANISM must be scram-sha-256 or scram-sha-512",
		);
	}
	const usernameKey = `KAFKA_SASL_USERNAME_${serviceUser}`;
	const passwordKey = `KAFKA_SASL_PASSWORD_${serviceUser}`;
	const username = runtimeEnv[usernameKey]?.trim();
	const password = runtimeEnv[passwordKey];
	if (!username || !password) {
		throw new Error(
			`KAFKA_AUTH_MODE=scram requires ${usernameKey} and ${passwordKey}`,
		);
	}
	return { mechanism, username, password };
}

function isScramMechanism(value: string): value is ScramMechanism {
	return (SCRAM_MECHANISMS as readonly string[]).includes(value);
}
