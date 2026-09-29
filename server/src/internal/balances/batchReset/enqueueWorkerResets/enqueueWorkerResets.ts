import {
	type CommandOrg,
	orgToCommandOrg,
	type ResetCommand,
} from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { AppEnv } from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { ResetEligibleCustomerEntitlementRow } from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { getResetSubjects, type ResetSubject } from "./getResetSubjects.js";

/** The org settings a reset carries, through the org cache every other path reads; null when the org is gone. */
const loadCommandOrg = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: CronContext;
	orgId: string;
	env: AppEnv;
}): Promise<CommandOrg | null> => {
	const orgWithFeatures = await getOrgWithFeaturesCached({
		db: ctx.db,
		orgId,
		env,
	});
	return orgWithFeatures ? orgToCommandOrg({ org: orgWithFeatures.org }) : null;
};

/** One reset per subject per sweep: the id makes a re-enqueued page a duplicate, not a second refill. */
const subjectToResetCommand = ({
	subject,
	org,
	dueBefore,
	now,
}: {
	subject: ResetSubject;
	org: CommandOrg;
	dueBefore: number;
	now: number;
}): ResetCommand => {
	const commandId = `reset_${subject.internalCustomerId}_${subject.internalEntityId ?? "customer"}_${dueBefore}`;
	return {
		schemaVersion: 1,
		type: "reset",
		commandId,
		requestId: commandId,
		identity: {
			orgId: subject.orgId,
			env: subject.env,
			customerId: subject.customerId,
			entityId: subject.entityId,
		},
		occurredAt: now,
		org,
	};
};

/**
 * The worker lane of a sweep page: each subject behind the due rows (the customer, or an entity for its own
 * rows) gets a `reset` on the command topic, and the owning worker refills what that subject holds in one
 * record. Returns how many were queued.
 */
export const enqueueWorkerResets = async ({
	ctx,
	page,
	dueBefore,
	now,
	client = getBalanceWorkerClient(),
}: {
	ctx: CronContext;
	page: ResetEligibleCustomerEntitlementRow[];
	dueBefore: number;
	now: number;
	client?: Pick<BalanceWorkerClient, "queue">;
}): Promise<number> => {
	const subjects = await getResetSubjects({ db: ctx.db, page });
	const commands: ResetCommand[] = [];
	for (const subject of subjects) {
		const org = await loadCommandOrg({
			ctx,
			orgId: subject.orgId,
			env: subject.env as AppEnv,
		});
		if (!org) continue;
		commands.push(subjectToResetCommand({ subject, org, dueBefore, now }));
	}
	await client.queue.reset({ commands });
	return commands.length;
};
