import { topicName } from "./primitives.js";

const LOCAL_DEPLOYMENT = "local";
const DEFAULT_SLOT = "blue";

export type BalanceWorkerSlot = "blue" | "green";

/** The one name a server and its workers share; every Kafka name derives from it. */
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

/** Which of the deployment's two fleets this worker belongs to; only the consumer group carries it. */
export function getBalanceWorkerSlot({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): BalanceWorkerSlot {
	const configured = runtimeEnv.BALANCE_WORKER_SLOT?.trim();
	if (configured === "blue" || configured === "green") return configured;
	if (configured) {
		throw new Error(`BALANCE_WORKER_SLOT must be blue or green: ${configured}`);
	}
	if (runtimeEnv.NODE_ENV === "production") {
		throw new Error("BALANCE_WORKER_SLOT is required in production");
	}
	return DEFAULT_SLOT;
}

export function balanceWorkerDeploymentToKafkaNames({
	deployment,
	slot = DEFAULT_SLOT,
}: {
	deployment: string;
	slot?: BalanceWorkerSlot;
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
		consumerGroup: `${deployment}-${slot}-workers`,
	};
}
