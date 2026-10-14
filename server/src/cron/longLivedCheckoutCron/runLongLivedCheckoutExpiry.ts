import {
	type DeferredAutumnBillingPlanData,
	type Metadata,
	MetadataType,
	metadata,
} from "@autumn/shared";
import { addDays } from "date-fns";
import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import { createStripeCli } from "@/external/connect/createStripeCli";
import {
	expireCustomerProducts,
	expirePendingCustomerProducts,
} from "@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { generateId } from "@/utils/genUtils";
import { createWorkerAutumnContext } from "@/utils/workerUtils/createAutumnContext";
import type { CronContext } from "../utils/CronContext";

const PAGE_SIZE = 100;

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
					or(
						eq(metadata.type, MetadataType.LongLivedCheckoutEnabledImmediately),
						and(
							eq(metadata.type, MetadataType.CheckoutSessionV2),
							isNotNull(
								sql`${metadata.data}->'billingContext'->'longLivedCheckout'`,
							),
						),
					),
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
	const { orgId, env } = pendingMetadata.data as DeferredAutumnBillingPlanData;
	const sessionId = pendingMetadata.stripe_checkout_session_id;
	const ctx = await createWorkerAutumnContext({
		db: cronContext.db,
		orgId,
		env,
		logger: cronContext.logger,
		workerId: generateId("long-lived-checkout-cron"),
	});

	if (sessionId) {
		const stripeCli = createStripeCli({ org: ctx.org, env });
		const session = await stripeCli.checkout.sessions.retrieve(sessionId);
		if (session.status === "complete") {
			await postponeExpiry({ cronContext, pendingMetadata });
			return;
		}
		if (session.status === "open") {
			await stripeCli.checkout.sessions.expire(sessionId);
		}

		const grantedCustomerProducts =
			await CusProductService.getByStripeCheckoutSessionId({
				db: ctx.db,
				stripeCheckoutSessionId: sessionId,
				orgId,
				env,
			});
		const unpaidCustomerProducts = grantedCustomerProducts.filter(
			(customerProduct) =>
				(customerProduct.subscription_ids ?? []).length === 0,
		);

		await expireCustomerProducts({
			ctx,
			customerProducts: unpaidCustomerProducts,
		});

		for (const customerProduct of unpaidCustomerProducts) {
			await invalidateCachedFullSubject({
				ctx,
				customerId:
					customerProduct.customer_id ?? customerProduct.customer?.id ?? "",
				source: "longLivedCheckoutCron",
			});
		}
	}

	await expirePendingCustomerProducts({ ctx, metadataId: pendingMetadata.id });
	await MetadataService.delete({ db: ctx.db, id: pendingMetadata.id });
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
