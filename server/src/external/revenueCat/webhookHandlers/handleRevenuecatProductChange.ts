import type { WebhookProductChange } from "@puzzmo/revenue-cat-webhook-types";
import type { FullCusProduct } from "@shared/index";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting";
import { setRevenueCatLogContext } from "@/external/revenueCat/misc/revenueCatLogContext";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

const ENDED_TOLERANCE_MS = 10 * 60 * 1000;

const renewedAfterEvent = ({
	cusProduct,
	eventTimestampMs,
}: {
	cusProduct: FullCusProduct;
	eventTimestampMs: number;
}) => (cusProduct.processor?.current_period_start ?? 0) > eventTimestampMs;

export const handleProductChange = async ({
	event,
	ctx,
}: {
	event: WebhookProductChange;
	ctx: RevenueCatWebhookContext;
}) => {
	const { db, org, env } = ctx;
	const { original_transaction_id, expiration_at_ms } = event;
	const eventTimestampMs = event.event_timestamp_ms ?? Date.now();

	const skip = (reason: string) => {
		ctx.logger
			.child({
				context: {
					extras: { rc_product_change: true, outcome: "noop", reason },
				},
			})
			.info(`[handleProductChange] no-op: ${reason}`);
		return { success: true };
	};

	if (event.store !== "PLAY_STORE") return skip("not a Google Play change");
	if (
		!expiration_at_ms ||
		expiration_at_ms > eventTimestampMs + ENDED_TOLERANCE_MS
	)
		return skip("replaced subscription has not ended yet");
	if (!original_transaction_id) return skip("no original_transaction_id");

	const [match] =
		await customerProductRepo.listActiveRevenueCatByOriginalTransaction({
			db,
			orgId: org.id,
			env,
			originalTransactionId: original_transaction_id,
		});
	if (!match) return skip("no active plan for the replaced purchase");

	const holder = await CusService.getFull({
		ctx,
		idOrInternalId: match.internal_customer_id,
		withEntities: true,
		withSubs: true,
	});
	const replacedCusProduct = holder.customer_products.find(
		(cusProduct) => cusProduct.id === match.id,
	);
	if (!replacedCusProduct) return skip("replaced plan not loaded");
	if (renewedAfterEvent({ cusProduct: replacedCusProduct, eventTimestampMs }))
		return skip("plan renewed after this event");

	ctx.customerId = holder.id ?? "";
	setRevenueCatLogContext({ ctx, customerId: ctx.customerId });
	const { ctx: holderCtx } = getCtxWithCustomerRedis({
		ctx,
		customerId: ctx.customerId,
	});

	await customerProductActions.expireAndActivateDefault({
		ctx: holderCtx,
		customerProduct: replacedCusProduct,
		fullCustomer: holder,
		updates: {
			ended_at: Math.min(expiration_at_ms, Date.now()),
			canceled: !!replacedCusProduct.canceled_at,
		},
		emitBillingUpdated: true,
	});

	ctx.logger
		.child({
			context: {
				extras: {
					rc_product_change: true,
					outcome: "expired",
					holder_customer_id: holder.id ?? holder.internal_id,
					cus_product_id: replacedCusProduct.id,
					event_app_user_id: event.app_user_id,
				},
			},
		})
		.info(
			`[handleProductChange] expired replaced cus_product ${replacedCusProduct.id}`,
		);

	return { success: true };
};
