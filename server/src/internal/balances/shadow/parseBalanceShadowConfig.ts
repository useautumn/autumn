import {
	balanceWorkerDeploymentToKafkaNames,
	getBalanceWorkerDeployment,
} from "@autumn/env/balanceWorkerClient";
import { z } from "zod/v4";
import type { BalanceShadowConfig } from "./balanceShadowTypes.js";

const identifier = z.string().min(1).max(200);
export const BalanceShadowConfigSchema = z.strictObject({
	runId: identifier,
	ownershipTopic: identifier,
	expiresAt: z.number().int().positive(),
	customers: z
		.array(
			z.strictObject({
				orgId: identifier,
				env: z.enum(["live", "sandbox"]),
				customerId: identifier,
				featureId: identifier,
			}),
		)
		.min(1)
		.max(20),
});

export function parseBalanceShadowConfig({
	runtimeEnv,
	now = Date.now(),
	purpose = "run",
}: {
	runtimeEnv: Record<string, string | undefined>;
	now?: number;
	purpose?: "run" | "inspect";
}): BalanceShadowConfig | undefined {
	const raw = runtimeEnv.BALANCE_WORKER_SHADOW;
	if (!raw) return undefined;
	if (Buffer.byteLength(raw) > 16_384)
		throw new Error("Shadow config exceeds 16 KiB");
	const config = BalanceShadowConfigSchema.parse(JSON.parse(raw));
	const servingOwnershipTopic = balanceWorkerDeploymentToKafkaNames({
		deployment: getBalanceWorkerDeployment({ runtimeEnv }),
	}).ownershipTopic;
	if (config.ownershipTopic === servingOwnershipTopic)
		throw new Error("Shadow requires a separate ownership topic");
	if (
		(purpose === "run" && config.expiresAt <= now) ||
		config.expiresAt > now + 86_400_000
	)
		throw new Error("Shadow expiry must be within the next 24 hours");
	const identities = config.customers.map((customer) =>
		JSON.stringify([
			customer.orgId,
			customer.env,
			customer.customerId,
			customer.featureId,
		]),
	);
	if (new Set(identities).size !== identities.length)
		throw new Error("Duplicate shadow cohort entry");
	return config;
}
