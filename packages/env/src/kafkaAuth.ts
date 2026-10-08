const SCRAM_MECHANISMS = ["scram-sha-256", "scram-sha-512"] as const;
type ScramMechanism = (typeof SCRAM_MECHANISMS)[number];
const AUTH_MODES = ["none", "scram", "plain"] as const;
type KafkaAuthMode = (typeof AUTH_MODES)[number];
type SaslCredentials = {
	mechanism: ScramMechanism | "plain";
	username: string;
	password: string;
};

export type KafkaServiceUser = "SERVER" | "HERALD" | "BALANCE_WORKER";

export function createKafkaAuthEnv({
	runtimeEnv,
	serviceUser,
}: {
	runtimeEnv: Record<string, string | undefined>;
	serviceUser: KafkaServiceUser;
}) {
	// No default: Confluent needs "plain" and its credentials, local plaintext Kafka opts into "none".
	const authMode = runtimeEnv.KAFKA_AUTH_MODE;
	if (authMode === undefined) throw new Error("KAFKA_AUTH_MODE is required");
	if (!isKafkaAuthMode(authMode)) {
		throw new Error("KAFKA_AUTH_MODE must be none, scram or plain");
	}
	return {
		KAFKA_AUTH_MODE: authMode,
		KAFKA_SASL: readSaslCredentials({ runtimeEnv, serviceUser, authMode }),
	} as const;
}

function readSaslCredentials({
	runtimeEnv,
	serviceUser,
	authMode,
}: {
	runtimeEnv: Record<string, string | undefined>;
	serviceUser: KafkaServiceUser;
	authMode: KafkaAuthMode;
}): SaslCredentials | undefined {
	if (authMode !== "scram" && authMode !== "plain") return undefined;
	const mechanism =
		authMode === "plain" ? "plain" : readScramMechanism({ runtimeEnv });
	const usernameKey = `KAFKA_SASL_USERNAME_${serviceUser}`;
	const passwordKey = `KAFKA_SASL_PASSWORD_${serviceUser}`;
	const username = runtimeEnv[usernameKey]?.trim();
	const password = runtimeEnv[passwordKey];
	if (!username || !password) {
		throw new Error(
			`KAFKA_AUTH_MODE=${authMode} requires ${usernameKey} and ${passwordKey}`,
		);
	}
	return { mechanism, username, password };
}

function readScramMechanism({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): ScramMechanism {
	const mechanism = runtimeEnv.KAFKA_SASL_MECHANISM ?? "scram-sha-256";
	if (!isScramMechanism(mechanism)) {
		throw new Error(
			"KAFKA_SASL_MECHANISM must be scram-sha-256 or scram-sha-512",
		);
	}
	return mechanism;
}

function isKafkaAuthMode(value: string): value is KafkaAuthMode {
	return (AUTH_MODES as readonly string[]).includes(value);
}

function isScramMechanism(value: string): value is ScramMechanism {
	return (SCRAM_MECHANISMS as readonly string[]).includes(value);
}
