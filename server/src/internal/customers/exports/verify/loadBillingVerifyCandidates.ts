import type { CustomerExportSnapshot } from "@autumn/shared";
import { dbReplicaSlow } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getCandidatesByStripeCustomerIds,
	getSharedStripeCustomerIds,
	getStripeLinkedCandidates,
} from "../queries/getBillingVerifyCandidates.js";
import type {
	CustomerExportPopulation,
	CustomerExportScalarRow,
} from "../queries/getCustomerExportScalars.js";
import { billingVerifyExportConfig } from "./billingVerifyExportConfig.js";
import { retryExportDbRead } from "./retryExportDbRead.js";
import type { BillingVerifySweep } from "./setupBillingVerifySweep.js";
import { toBatches } from "./toBatches.js";

/** Only a customer with a swept Stripe subscription, a Stripe-linked plan or
 * a shared Stripe id has anything to verify, and each is reached by an index
 * instead of walking the population. The org-wide reads take seconds, which
 * is what the replica's slow lane exists for. */
export const loadBillingVerifyCandidates = async ({
	ctx,
	snapshot,
	population,
	sweep,
}: {
	ctx: AutumnContext;
	snapshot: CustomerExportSnapshot;
	population: CustomerExportPopulation;
	sweep: BillingVerifySweep;
}): Promise<{
	candidates: CustomerExportScalarRow[];
	sharedStripeCustomerIds: Set<string>;
}> => {
	const { upperBoundInternalId, createdAtCutoff } = population;
	if (upperBoundInternalId === null) {
		return { candidates: [], sharedStripeCustomerIds: new Set() };
	}

	const { lookupBatchSize, timeoutMs } = billingVerifyExportConfig.candidates;
	const { logger } = ctx;
	const limits = { timeoutMs };
	const readSharedStripeCustomerIds = retryExportDbRead({
		logger,
		operation: "getSharedStripeCustomerIds",
		query: getSharedStripeCustomerIds,
		limits,
	});
	const readStripeLinkedCandidates = retryExportDbRead({
		logger,
		operation: "getStripeLinkedCandidates",
		query: getStripeLinkedCandidates,
		limits,
	});
	const readCandidatesByStripeCustomerIds = retryExportDbRead({
		logger,
		operation: "getCandidatesByStripeCustomerIds",
		query: getCandidatesByStripeCustomerIds,
	});

	const org = { db: dbReplicaSlow ?? ctx.db, orgId: ctx.org.id, env: ctx.env };
	const scope = { ...org, snapshot, upperBoundInternalId, createdAtCutoff };
	const [sharedStripeCustomerIds, stripeLinked] = await Promise.all([
		readSharedStripeCustomerIds(org),
		readStripeLinkedCandidates(scope),
	]);

	const candidatesByInternalId = new Map(
		stripeLinked.map((scalar) => [scalar.internal_id, scalar]),
	);
	const stripeCustomerIds = new Set([
		...sweep.sweptSubscriptions.keys(),
		...sharedStripeCustomerIds,
	]);
	for (const batch of toBatches({
		items: [...stripeCustomerIds],
		size: lookupBatchSize,
	})) {
		const scalars = await readCandidatesByStripeCustomerIds({
			...scope,
			stripeCustomerIds: batch,
		});
		for (const scalar of scalars) {
			candidatesByInternalId.set(scalar.internal_id, scalar);
		}
	}

	return {
		candidates: [...candidatesByInternalId.values()],
		sharedStripeCustomerIds,
	};
};
