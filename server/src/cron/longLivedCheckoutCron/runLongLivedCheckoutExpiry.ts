import {
	type DeferredAutumnBillingPlanData,
	type Metadata,
	MetadataType,
	metadata,
} from "@autumn/shared";
import { addDays } from "date-fns";
import { and, asc, eq, lt } from "drizzle-orm";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { expireAbandonedCheckoutCustomerProducts } from "@/internal/billing/v2/execute/pendingCustomerProducts/expireAbandonedCheckoutCustomerProducts";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { generateId } from "@/utils/genUtils";
import { createWorkerAutumnContext } from "@/utils/workerUtils/createAutumnContext";
import type { CronContext } from "../utils/CronContext";

const PAGE_SIZE = 100;

// Served by idx_metadata_on_type_expires_at.
const getExpiredLongLivedCheckoutMetadata = ({
	db,
	now,
}: {
	db: CronContext["db"];
	now: number;
}) =>
	withStatementTimeout(db, async (tx) =>
		tx
			.select()
			.from(metadata)
			.where(
				and(
					eq(metadata.type, MetadataType.LongLivedCheckout),
					lt(metadata.expires_at, now),
				),
			)
			.orderBy(asc(metadata.expires_at))
			.limit(PAGE_SIZE),
	);

const postponeExpiry = ({
	cronContext,
	pendingMetadata,
}: {
	cronContext: CronContext;
	pendingMetadata: Metadata;
}) =>
	MetadataService.update({
		db: cronContext.db,
		id: pendingMetadata.id,
		updates: { expires_at: addDays(Date.now(), 1).getTime() },
	});

const expireLongLivedCheckout = async ({
	cronContext,
	pendingMetadata,
}: {
	cronContext: CronContext;
	pendingMetadata: Metadata;
}) => {
	const { orgId, env, billingContext } =
		pendingMetadata.data as DeferredAutumnBillingPlanData;
	const { fullCustomer } = billingContext;
	const sessionId = pendingMetadata.stripe_checkout_session_id;
	const ctx = await createWorkerAutumnContext({
		db: cronContext.db,
		orgId,
		env,
		logger: cronContext.logger,
		workerId: generateId("long-lived-checkout-cron"),
	});

	// Session creation failed after the metadata insert, so nothing was granted.
	if (!sessionId) {
		await MetadataService.delete({ db: ctx.db, id: pendingMetadata.id });
		return;
	}

	const stripeCli = createStripeCli({ org: ctx.org, env });
	const session = await stripeCli.checkout.sessions.retrieve(sessionId);
	// Paid but not yet linked: leave it for the completion webhook and recheck later.
	if (session.status === "complete") {
		await postponeExpiry({ cronContext, pendingMetadata });
		return;
	}
	if (session.status === "open") {
		await stripeCli.checkout.sessions.expire(sessionId);
	}

	await expireAbandonedCheckoutCustomerProducts({
		ctx,
		stripeCheckoutSessionId: sessionId,
		metadataId: pendingMetadata.id,
	});
	await invalidateCachedFullSubject({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		source: "longLivedCheckoutCron",
	});
};

export const runLongLivedCheckoutExpiry = async ({
	ctx,
}: {
	ctx: CronContext;
}) => {
	try {
		const expiredMetadata = await getExpiredLongLivedCheckoutMetadata({
			db: ctx.db,
			now: Date.now(),
		});

		for (const pendingMetadata of expiredMetadata) {
			try {
				await expireLongLivedCheckout({ cronContext: ctx, pendingMetadata });
			} catch (error) {
				ctx.logger.error(
					`[Long-lived checkout expiry] Failed for metadata ${pendingMetadata.id}: ${error}`,
				);
				await postponeExpiry({ cronContext: ctx, pendingMetadata });
			}
		}
	} catch (error) {
		ctx.logger.error(`[Long-lived checkout expiry] Error: ${error}`);
	}
};
