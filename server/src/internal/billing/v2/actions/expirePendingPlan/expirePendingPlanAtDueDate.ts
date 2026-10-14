import type { AppEnv, Metadata } from "@autumn/shared";
import type Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { hasStripeInvoicePayment } from "@/external/stripe/invoices/utils/classifyStripeInvoice";
import { expirePendingCustomerProducts } from "@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts";
import { withDeferredBillingPlanLock } from "@/internal/billing/v2/execute/withDeferredBillingPlanLock";
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
	if (hasStripeInvoicePayment(stripeInvoice)) {
		await MetadataService.update({
			db: ctx.db,
			id: metadata.id,
			updates: { expires_at: null },
		});
		return;
	}

	const invoiceClosed = await voidInvoiceAtDueDate({
		ctx,
		stripeCli,
		metadata,
		stripeInvoice,
	});
	if (!invoiceClosed) return;

	await expirePendingCustomerProducts({ ctx, metadataId: metadata.id });
	await releaseExpiredPendingPlan({ ctx, stripeCli, metadata, stripeInvoice });
};

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
		await withDeferredBillingPlanLock({
			orgId,
			env,
			metadataId: params.metadata.id,
			fn: async () => {
				const current = await MetadataService.get({
					db: ctx.db,
					id: params.metadata.id,
				});
				if (!current) return;
				await expireUnpaidPendingPlan({ ctx: repoContext, ...params });
			},
		});
	} catch (error) {
		ctx.logger.error(
			`[expirePendingPlanAtDueDate] Failed for invoice ${params.stripeInvoice.id}; retrying next run: ${error}`,
			{ error_type: "pending_plan_expiry_failed" },
		);
	}
};
