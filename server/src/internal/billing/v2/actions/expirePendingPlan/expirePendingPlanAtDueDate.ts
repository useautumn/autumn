import type { AppEnv, Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { hasStripeInvoicePayment } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import { expirePendingCustomerProducts } from "@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { releaseExpiredPendingPlan } from "./execute/releaseExpiredPendingPlan";
import { voidInvoiceAtDueDate } from "./execute/voidInvoiceAtDueDate";

type ExpirePendingPlanParams = {
	stripeCli: Stripe;
	metadata: Metadata;
	stripeInvoice: Stripe.Invoice;
};

const expireUnpaidPendingPlan = async ({
	ctx,
	stripeCli,
	metadata,
	stripeInvoice,
}: ExpirePendingPlanParams & { ctx: RepoContext }) => {
	// 1. Any payment keeps the pending plan; stop the cron re-picking it
	if (hasStripeInvoicePayment(stripeInvoice)) {
		await MetadataService.update({
			db: ctx.db,
			id: metadata.id,
			updates: { expires_at: null },
		});
		return;
	}

	// 2. Close the invoice
	const invoiceClosed = await voidInvoiceAtDueDate({
		ctx,
		stripeCli,
		metadata,
		stripeInvoice,
	});
	if (!invoiceClosed) return;

	// 3. Expire the plan, then cancel the sub it created
	await expirePendingCustomerProducts({ ctx, metadataId: metadata.id });
	await releaseExpiredPendingPlan({ ctx, stripeCli, metadata, stripeInvoice });
};

/** A deferred invoice reached its due date: give up the pending plan unless anything was paid. */
export const expirePendingPlanAtDueDate = async ({
	ctx,
	orgId,
	env,
	...params
}: ExpirePendingPlanParams & {
	ctx: Pick<RepoContext, "db" | "logger">;
	orgId: string;
	env: AppEnv;
}) => {
	const repoContext: RepoContext = {
		...ctx,
		org: { id: orgId },
		env,
		redisV2: resolveRedisV2(),
	};

	try {
		await expireUnpaidPendingPlan({ ctx: repoContext, ...params });
	} catch (error) {
		ctx.logger.error(
			`[expirePendingPlanAtDueDate] Failed for invoice ${params.stripeInvoice.id}; retrying next run: ${error}`,
		);
	}
};
