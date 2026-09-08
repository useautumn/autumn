import { meteringPartitionKeyOf } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BalanceShadowConfig } from "../balanceShadowTypes.js";
import {
	type BalanceShadowInspection,
	inspectBalanceShadowCustomer,
} from "./inspectBalanceShadowCustomer.js";

export type BalanceShadowCustomer = Omit<
	BalanceShadowConfig["customers"][number],
	"featureId"
> & { featureIds: string[] };
export type BalanceShadowCustomerReport = BalanceShadowCustomer &
	BalanceShadowInspection;

export async function runBalanceShadowCohort({
	config,
	mode,
	execute = false,
	dependencies,
}: {
	config: BalanceShadowConfig;
	mode: "initialize" | "compare";
	execute?: boolean;
	dependencies: {
		owners: { start: () => Promise<void>; stop: () => Promise<void> };
		client: Pick<BalanceWorkerClient, "check" | "initialize">;
		loadContext: (customer: BalanceShadowCustomer) => Promise<AutumnContext>;
		loadSubject: (args: {
			ctx: AutumnContext;
			customerId: string;
		}) => Promise<FullSubject>;
		report: (result: BalanceShadowCustomerReport) => void;
	};
}): Promise<BalanceShadowCustomerReport[]> {
	const customers = new Map<string, BalanceShadowCustomer>();
	for (const { featureId, ...identity } of config.customers) {
		const key = meteringPartitionKeyOf({ identity });
		const customer = customers.get(key) ?? { ...identity, featureIds: [] };
		customer.featureIds.push(featureId);
		customers.set(key, customer);
	}
	const results: BalanceShadowCustomerReport[] = [];
	try {
		await dependencies.owners.start();
		for (const customer of customers.values()) {
			let inspection: BalanceShadowInspection;
			try {
				const ctx = await dependencies.loadContext(customer);
				inspection = await inspectBalanceShadowCustomer({
					ctx,
					...customer,
					runId: config.runId,
					expiresAt: config.expiresAt,
					mode,
					execute,
					client: dependencies.client,
					loadSubject: () =>
						dependencies.loadSubject({ ctx, customerId: customer.customerId }),
				});
			} catch (error) {
				inspection = {
					status: "inconclusive",
					reason:
						error instanceof Error ? error.message : "Customer lookup failed",
				};
			}
			const result = { ...customer, ...inspection };
			results.push(result);
			dependencies.report(result);
		}
		return results;
	} finally {
		await dependencies.owners.stop();
	}
}
