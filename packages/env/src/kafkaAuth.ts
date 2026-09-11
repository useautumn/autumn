export function createKafkaAuthEnv({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}) {
	// Staging and production use MSK IAM without an Infisical auth-mode setting.
	// Local plaintext Kafka and tests must explicitly opt into "none".
	const authMode = runtimeEnv.KAFKA_AUTH_MODE ?? "msk_iam";
	if (authMode !== "none" && authMode !== "msk_iam") {
		throw new Error("KAFKA_AUTH_MODE must be none or msk_iam");
	}
	const region = runtimeEnv.AWS_REGION?.trim() || undefined;
	if (authMode === "msk_iam" && !region) {
		throw new Error("KAFKA_AUTH_MODE=msk_iam requires AWS_REGION");
	}
	return { KAFKA_AUTH_MODE: authMode, AWS_REGION: region } as const;
}
