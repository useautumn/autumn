import {
	type AttachBodyV0,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

export const handleRenewProduct = async ({
	ctx,
	attachParams,
	body,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	body: AttachBodyV0;
}) => {
	await billingActions.legacy.renew({
		ctx,
		attachParams,
		body,
	});

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.RenewedProduct,
		message: `Successfully renewed product`,
	});

	// const { logger, db } = ctx;
	// const { stripeCli } = attachParams;
	// let { curScheduledProduct } = attachParamToCusProducts({ attachParams });
	// const curCusProduct = attachParamsToCurCusProduct({ attachParams });

	// const product = attachParams.products[0];
	// const cusProducts = attachParams.customer.customer_products;
	// const curSubId = curCusProduct?.subscription_ids?.[0];

	// if (!curCusProduct) {
	// 	throw new RecaseError({
	// 		message: `RENEW FLOW, curCusProduct is undefined`,
	// 		code: ErrCode.InvalidRequest,
	// 		statusCode: StatusCodes.BAD_REQUEST,
	// 	});
	// }

	// if (curCusProduct.product.is_add_on) {
	// 	curScheduledProduct = undefined;
	// }

	// const schedule = await cusProductToSchedule({
	// 	cusProduct: curCusProduct,
	// 	stripeCli,
	// });

	// const otherCanceled = cusProducts.some(
	// 	(cp) =>
	// 		cp.subscription_ids?.includes(curSubId || "") &&
	// 		cp.canceled &&
	// 		cp.id !== curCusProduct?.id,
	// );

	// let expectedEnd: number | undefined;
	// if (curSubId) {
	// 	const curSub = await getSubForAttach({
	// 		stripeCli,
	// 		subId: curSubId,
	// 	});
	// 	const subItems = curSub?.items.data.filter((item) =>
	// 		subItemInCusProduct({ cusProduct: curCusProduct, subItem: item }),
	// 	);
	// 	expectedEnd = getLatestPeriodEnd({ subItems });
	// }

	// if (!otherCanceled) {
	// 	if (schedule) {
	// 		logger.info(`RENEW FLOW: releasing schedule ${schedule.id}`);
	// 		await stripeCli.subscriptionSchedules.release(schedule.id);

	// 		await CusProductService.updateByStripeScheduledId({
	// 			db,
	// 			stripeScheduledId: schedule.id,
	// 			updates: {
	// 				scheduled_ids: [],
	// 			},
	// 		});
	// 	}

	// 	if (curSubId) {
	// 		// Add sub ID to upstash so webhook handler doesn't handle again
	// 		await setStripeSubscriptionLock({
	// 			stripeSubscriptionId: curSubId,
	// 			lockedAtMs: Date.now(),
	// 		});

	// 		// Uncancel the sub
	// 		await stripeCli.subscriptions.update(curSubId, {
	// 			cancel_at: null,
	// 		});
	// 	}

	// 	await CusProductService.update({
	// 		db,
	// 		cusProductId: curCusProduct.id,
	// 		updates: {
	// 			canceled: false,
	// 			canceled_at: null,
	// 			ended_at: null,
	// 		},
	// 	});
	// } else {
	// 	// Remove scheduled product ONLY if product is not an add on
	// 	const scheduledProduct = curScheduledProduct;

	// 	// Case 1: Add current cus product back to schedule and remove scheduled product from schedule
	// 	if (schedule) {
	// 		logger.info(
	// 			`RENEW FLOW: adding cur cus product back to schedule ${schedule.id}`,
	// 		);
	// 		const newItems = await paramsToScheduleItems({
	// 			ctx,
	// 			attachParams,
	// 			config,
	// 			schedule,
	// 			removeCusProducts: scheduledProduct ? [scheduledProduct] : [],
	// 			billingPeriodEnd: expectedEnd,
	// 		});

	// 		if (newItems.phases.length > 1) {
	// 			const curSub = (await paramsToCurSub({
	// 				attachParams,
	// 			})) as Stripe.Subscription;

	// 			await updateCurSchedule({
	// 				ctx,
	// 				attachParams,
	// 				schedule,
	// 				newPhases: newItems.phases,
	// 				sub: curSub,
	// 			});

	// 			await CusProductService.update({
	// 				db,
	// 				cusProductId: curCusProduct.id,
	// 				updates: {
	// 					scheduled_ids: [schedule.id],
	// 					canceled: false,
	// 					canceled_at: null,
	// 					ended_at: null,
	// 				},
	// 			});
	// 		} else {
	// 			logger.info(
	// 				`RENEW FLOW: no new schedule items, releasing schedule ${schedule.id}`,
	// 			);
	// 			await stripeCli.subscriptionSchedules.release(schedule.id);

	// 			await CusProductService.updateByStripeScheduledId({
	// 				db,
	// 				stripeScheduledId: schedule.id,
	// 				updates: {
	// 					scheduled_ids: [],
	// 				},
	// 			});

	// 			await CusProductService.update({
	// 				db,
	// 				cusProductId: curCusProduct.id,
	// 				updates: {
	// 					canceled: false,
	// 					canceled_at: null,
	// 					ended_at: null,
	// 				},
	// 			});
	// 		}
	// 	}
	// 	// Case 2: Create new schedule for current cus product
	// 	// Example scenario: Premium 1, Premium 2, Free 1, Free 2, Premium 1
	// 	else {
	// 		logger.info(`RENEW FLOW: creating new schedule`);
	// 		const curSub = (await cusProductToSub({
	// 			cusProduct: curCusProduct,
	// 			stripeCli,
	// 		})) as Stripe.Subscription;

	// 		const periodEnd = getLatestPeriodEnd({ sub: curSub });
	// 		await subToNewSchedule({
	// 			ctx,
	// 			sub: curSub,
	// 			attachParams,
	// 			config,
	// 			endOfBillingPeriod: periodEnd,
	// 		});

	// 		await CusProductService.update({
	// 			db,
	// 			cusProductId: curCusProduct.id,
	// 			updates: {
	// 				canceled: false,
	// 				canceled_at: null,
	// 				ended_at: null,
	// 			},
	// 		});
	// 	}
	// }

	// if (curCusProduct) {
	// 	try {
	// 		await addProductsUpdatedWebhookTask({
	// 			ctx,
	// 			internalCustomerId: curCusProduct.internal_customer_id,
	// 			org: attachParams.org,
	// 			env: attachParams.customer.env,
	// 			customerId:
	// 				attachParams.customer.id || attachParams.customer.internal_id,
	// 			scenario: AttachScenario.Renew,
	// 			cusProduct: curCusProduct,
	// 		});
	// 	} catch (error) {
	// 		logger.error(`RENEW FLOW: failed to add to webhook queue: ${error}`);
	// 	}
	// }

	// if (curScheduledProduct) {
	// 	await CusProductService.delete({
	// 		db,
	// 		cusProductId: curScheduledProduct.id,
	// 	});
	// }

	// return AttachFunctionResponseSchema.parse({
	// 	code: SuccessCode.RenewedProduct,
	// 	message: `Successfully renewed product ${product.name}`,
	// });
	// if (res) {
	// 	res.status(200).json(
	// 		AttachResultSchema.parse({
	// 			code: SuccessCode.RenewedProduct,
	// 			message: `Successfully renewed product ${product.name}`,
	// 			product_ids: [product.id],
	// 			customer_id:
	// 				attachParams.customer.id || attachParams.customer.internal_id,
	// 		}),
	// 	);
	// }
};
