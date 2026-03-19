import type { AppEnv } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { format } from "date-fns";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import type { BatchResetCusEntsPayload } from "@/queue/workflows";
import { workflows } from "@/queue/workflows";
import type { CronContext } from "../utils/CronContext";

const CUSTOMERS_PER_BATCH = 50;

export const runResetCron = async ({ ctx }: { ctx: CronContext }) => {
	const { db } = ctx;

	try {
		const customersToReset = await CusEntService.getCustomerIdsForReset({
			db,
		});

		if (customersToReset.length === 0) {
			console.log("Reset cron: no customers pending reset");
			return;
		}

		if (customersToReset.length === 10_000) {
			console.warn(
				"Reset cron: hit 10,000-customer limit — some customers may be deferred to the next run",
			);
		}

		console.log(
			`Reset cron: scheduling ${customersToReset.length} customers for reset`,
		);

		// Group customers by org + env so each SQS message has the right context
		const groupedByOrgEnv = new Map<
			string,
			{
				orgId: string;
				env: string;
				resets: BatchResetCusEntsPayload["resets"];
			}
		>();

		for (const row of customersToReset) {
			const key = `${row.orgId}:${row.env}`;
			let group = groupedByOrgEnv.get(key);
			if (!group) {
				group = { orgId: row.orgId, env: row.env, resets: [] };
				groupedByOrgEnv.set(key, group);
			}
			// cusEntIds left empty — the worker calls CusService.getFull which triggers lazy reset for all entitlements
			group.resets.push({
				internalCustomerId: row.internalCustomerId,
				customerId: row.customerId ?? "",
				cusEntIds: [],
			});
		}

		// Dispatch batches to SQS
		const triggers: Promise<void>[] = [];

		for (const group of groupedByOrgEnv.values()) {
			for (let i = 0; i < group.resets.length; i += CUSTOMERS_PER_BATCH) {
				const batch = group.resets.slice(i, i + CUSTOMERS_PER_BATCH);
				triggers.push(
					workflows.triggerBatchResetCusEnts({
						orgId: group.orgId,
						env: group.env as AppEnv,
						resets: batch,
					}),
				);
			}
		}

		await Promise.all(triggers);

		console.log(
			`Reset cron: dispatched ${triggers.length} SQS batches | ${format(new UTCDate(), "yyyy-MM-dd HH:mm:ss")}`,
		);
		console.log("----------------------------------\n");
	} catch (error) {
		console.error("Error in reset cron scheduler:", error);
	}
};
