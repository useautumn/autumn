import { topicName } from "./primitives.js";

const LOCAL_DEPLOYMENT = "local";

export function getBalanceWorkerDeployment({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): string {
	const configured = runtimeEnv.BALANCE_WORKER_DEPLOYMENT?.trim();
	if (configured) return topicName.parse(configured);
	if (runtimeEnv.NODE_ENV === "production") {
		throw new Error("BALANCE_WORKER_DEPLOYMENT is required in production");
	}
	return LOCAL_DEPLOYMENT;
}

export function balanceWorkerDeploymentToKafkaNames({
	deployment,
}: {
	deployment: string;
}): {
	meteringTopic: string;
	ownershipTopic: string;
	commandTopic: string;
	catalogInvalidationTopic: string;
	consumerGroup: string;
} {
	return {
		meteringTopic: `${deployment}-events`,
		ownershipTopic: `${deployment}-ownership`,
		commandTopic: `${deployment}-commands`,
		catalogInvalidationTopic: `${deployment}-catalog-invalidations`,
		consumerGroup: `${deployment}-workers`,
	};
}
