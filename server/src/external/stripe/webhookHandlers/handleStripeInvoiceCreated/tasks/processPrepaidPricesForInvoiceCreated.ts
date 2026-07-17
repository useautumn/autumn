import {
	addCusProductToCusEnt,
	BillingType,
	customerEntitlementToOptions,
	customerPriceToCustomerEntitlement,
	EntInterval,
	type FeatureOptions,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	getStartingBalance,
	InternalError,
	isCustomerEntitlementPrepaidWithSeparateResetInterval,
	notNullish,
	type PooledBalanceOp,
	PooledBalanceResetOwnerType,
	secondsToMs,
} from "@autumn/shared";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import { isStripeSubscriptionVercel } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import { getCustomerPricesWithCustomerProducts } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/utils/getCustomerPricesWithCustomerProducts";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import {
	applyPreparedPooledBalanceCacheCutover,
	executePooledBalanceOps,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { computePooledQuantityUpdateOps } from "@/internal/billing/v2/pooledBalances/compute/computePooledQuantityUpdateOps.js";
import { resetPooledBalancesByResetOwner } from "@/internal/billing/v2/pooledBalances/reset/resetPooledCustomerEntitlements.js";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService";
import { getRolloverUpdates } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { logPrepaidPriceProcessed } from "../logs/logInvoiceCreatedPriceProcessing";

type PooledCustomerProductOptionsUpdate = {
	customerProductId: string;
	options: FeatureOptions[];
};

type PooledCustomerEntitlementUpdate = {
	customerEntitlementId: string;
	updates: Parameters<typeof CusEntService.update>[0]["updates"];
};

type SubscriptionPeriod = ReturnType<typeof subToPeriodStartEnd>;

type PrepaidPriceResult = {
	pooledBalanceOps: PooledBalanceOp[];
	pooledCustomerProductOptionsUpdate?: PooledCustomerProductOptionsUpdate;
	pooledCustomerEntitlementUpdate?: PooledCustomerEntitlementUpdate;
};

export type ProcessPrepaidPricesDependencies = {
	updateCustomerProduct: typeof CusProductService.update;
	updateCustomerEntitlement: typeof CusEntService.update;
	decrementCustomerEntitlement: typeof CusEntService.decrement;
	insertRollovers: typeof RolloverService.insert;
	executePooledBalanceOps: typeof executePooledBalanceOps;
	applyPooledBalanceCacheCutover?: typeof applyPreparedPooledBalanceCacheCutover;
	resetPooledBalancesByResetOwner: typeof resetPooledBalancesByResetOwner;
	deleteCachedFullCustomer: typeof deleteCachedFullCustomer;
	withCustomerBalanceSyncLock: typeof withCustomerBalanceSyncLock;
};

const defaultDependencies: ProcessPrepaidPricesDependencies = {
	updateCustomerProduct: CusProductService.update,
	updateCustomerEntitlement: CusEntService.update,
	decrementCustomerEntitlement: CusEntService.decrement,
	insertRollovers: RolloverService.insert,
	executePooledBalanceOps,
	applyPooledBalanceCacheCutover: applyPreparedPooledBalanceCacheCutover,
	resetPooledBalancesByResetOwner,
	deleteCachedFullCustomer,
	withCustomerBalanceSyncLock,
};

const emptyPrepaidPriceResult = (): PrepaidPriceResult => ({
	pooledBalanceOps: [],
});

const processPrepaidPrice = async ({
	ctx,
	customerPrice,
	customerEntitlement,
	subscriptionPeriod,
	dependencies,
}: {
	ctx: StripeWebhookContext;
	customerPrice: FullCustomerPrice;
	customerEntitlement: FullCusEntWithFullCusProduct;
	subscriptionPeriod: SubscriptionPeriod;
	dependencies: ProcessPrepaidPricesDependencies;
}) => {
	const options = customerEntitlementToOptions({
		customerEntitlement,
	});

	const customerProduct = customerEntitlement.customer_product;

	if (!options) return emptyPrepaidPriceResult();
	const previousQuantity = options?.quantity ?? 0;
	const resetQuantity = options?.upcoming_quantity ?? options?.quantity ?? 0;
	const newAllowance = getStartingBalance({
		entitlement: customerEntitlement.entitlement,
		options: {
			...options,
			quantity: resetQuantity,
		},
		relatedPrice: customerPrice.price,
		productQuantity: customerProduct?.quantity,
	});

	const resetUpdate = getResetBalancesUpdate({
		cusEnt: customerEntitlement,
		allowance: newAllowance,
	});

	const ent = customerEntitlement.entitlement;
	const isPooledEntitySource = isPooledSourceCustomerEntitlement({
		customerEntitlement,
		customerProduct,
	});
	const hasSeparateResetInterval =
		isCustomerEntitlementPrepaidWithSeparateResetInterval({
			customerEntitlement,
			customerPrice,
		});

	const { start, end } = subscriptionPeriod;

	const rolloverUpdate = getRolloverUpdates({
		cusEnt: customerEntitlement,
		nextResetAt: start * 1000,
	});

	let pooledBalanceOps: PooledBalanceOp[] = [];
	let pooledCustomerProductOptionsUpdate:
		| PooledCustomerProductOptionsUpdate
		| undefined;
	if (notNullish(options.upcoming_quantity) && customerProduct) {
		let renewedOptions: FeatureOptions | undefined;
		const newOptions = customerProduct.options.map((o) => {
			if (o.feature_id === ent.feature_id) {
				renewedOptions = {
					...o,
					quantity: o.upcoming_quantity ?? o.quantity,
					upcoming_quantity: undefined,
				};
				return renewedOptions;
			}
			return o;
		});

		if (isPooledEntitySource) {
			pooledCustomerProductOptionsUpdate = {
				customerProductId: customerProduct.id,
				options: newOptions,
			};
			if (ent.interval === EntInterval.Lifetime) {
				if (!renewedOptions) {
					throw new InternalError({
						message: `Missing renewed options for pooled lifetime source '${customerProduct.id}'.`,
					});
				}
				pooledBalanceOps = computePooledQuantityUpdateOps({
					customerProduct: { ...customerProduct, options: newOptions },
					updatedOptions: [renewedOptions],
				});
				if (pooledBalanceOps.length !== 1) {
					throw new InternalError({
						message: `Expected one pooled lifetime quantity operation for source '${customerProduct.id}'.`,
					});
				}
			}
		} else {
			await dependencies.updateCustomerProduct({
				ctx,
				cusProductId: customerProduct.id,
				updates: {
					options: newOptions,
				},
			});
			customerProduct.options = newOptions;

			if (ent.interval === EntInterval.Lifetime) {
				const difference =
					(options.quantity ?? 0) - (options.upcoming_quantity ?? 0);
				await dependencies.decrementCustomerEntitlement({
					ctx,
					id: customerEntitlement.id,
					amount: difference,
				});
				return emptyPrepaidPriceResult();
			}
		}
	}

	if (isPooledEntitySource) {
		const nextResetAt =
			ent.interval === EntInterval.Lifetime ? null : end * 1000;
		const pooledCustomerEntitlementUpdate = {
			customerEntitlementId: customerEntitlement.id,
			updates: {
				balance: 0,
				adjustment: 0,
				additional_balance: 0,
				entities: null,
				next_reset_at: nextResetAt,
			},
		} satisfies PooledCustomerEntitlementUpdate;

		logPrepaidPriceProcessed({
			ctx,
			customerEntitlement,
			previousQuantity,
			resetQuantity,
			newAllowance,
			nextResetAt: nextResetAt ?? end * 1000,
		});
		return {
			pooledBalanceOps,
			pooledCustomerProductOptionsUpdate,
			pooledCustomerEntitlementUpdate,
		};
	}

	if (hasSeparateResetInterval) {
		logPrepaidPriceProcessed({
			ctx,
			customerEntitlement,
			previousQuantity,
			resetQuantity,
			newAllowance,
			nextResetAt: customerEntitlement.next_reset_at ?? end * 1000,
		});
		return emptyPrepaidPriceResult();
	}

	if (ent.interval === EntInterval.Lifetime) {
		return emptyPrepaidPriceResult();
	}

	if (rolloverUpdate?.toInsert && rolloverUpdate.toInsert.length > 0) {
		await dependencies.insertRollovers({
			ctx,
			rows: rolloverUpdate.toInsert,
			fullCusEnt: customerEntitlement,
		});
	}

	await dependencies.updateCustomerEntitlement({
		ctx,
		id: customerEntitlement.id,
		updates: {
			...resetUpdate,
			next_reset_at: end * 1000,
		},
	});

	logPrepaidPriceProcessed({
		ctx,
		customerEntitlement,
		previousQuantity,
		resetQuantity,
		newAllowance,
		nextResetAt: end * 1000,
	});

	return emptyPrepaidPriceResult();
};

export const processPrepaidPricesForInvoiceCreatedWithDependencies = async ({
	ctx,
	eventContext,
	dependencies = defaultDependencies,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
	dependencies?: ProcessPrepaidPricesDependencies;
}): Promise<void> => {
	const { stripeInvoice, customerProducts, stripeSubscription } = eventContext;

	const isNewPeriod = stripeInvoice.billing_reason === "subscription_cycle";
	const isVercelSubscription = isStripeSubscriptionVercel(stripeSubscription);
	if (!isNewPeriod || isVercelSubscription) return;
	const subscriptionPeriod = subToPeriodStartEnd({ sub: stripeSubscription });

	const customerPrices = getCustomerPricesWithCustomerProducts({
		customerProducts,
		filters: {
			billingType: BillingType.UsageInAdvance,
		},
	});
	const pooledBalanceOps: PooledBalanceOp[] = [];
	const pooledOptionsUpdateByCustomerProductId = new Map<
		string,
		PooledCustomerProductOptionsUpdate
	>();
	const pooledEntitlementUpdateById = new Map<
		string,
		PooledCustomerEntitlementUpdate
	>();

	for (const customerPrice of customerPrices) {
		const cusProduct = customerPrice.customer_product;
		if (!cusProduct) continue;

		const cusEnt = customerPriceToCustomerEntitlement({
			customerPrice,
			customerEntitlements: cusProduct.customer_entitlements,
		});

		if (!cusEnt) continue;

		const cusEntWithProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct,
		});

		const result = await processPrepaidPrice({
			ctx,
			customerPrice,
			customerEntitlement: cusEntWithProduct,
			subscriptionPeriod,
			dependencies,
		});
		pooledBalanceOps.push(...result.pooledBalanceOps);
		if (result.pooledCustomerProductOptionsUpdate) {
			pooledOptionsUpdateByCustomerProductId.set(
				result.pooledCustomerProductOptionsUpdate.customerProductId,
				result.pooledCustomerProductOptionsUpdate,
			);
		}
		if (result.pooledCustomerEntitlementUpdate) {
			pooledEntitlementUpdateById.set(
				result.pooledCustomerEntitlementUpdate.customerEntitlementId,
				result.pooledCustomerEntitlementUpdate,
			);
		}
	}

	const customerId =
		eventContext.fullCustomer.id ?? eventContext.fullCustomer.internal_id;
	const { pooledResets, preparedCutover } =
		await dependencies.withCustomerBalanceSyncLock({
			ctx,
			customerId,
			internalCustomerId: eventContext.fullCustomer.internal_id,
			callback: async ({ db }) => {
				const transactionContext = { ...ctx, db };
				const pooledResets = await dependencies.resetPooledBalancesByResetOwner(
					{
						ctx: transactionContext,
						customerId,
						internalCustomerId: eventContext.fullCustomer.internal_id,
						resetOwnerType: PooledBalanceResetOwnerType.Subscription,
						resetOwnerId: eventContext.stripeSubscriptionId,
						now: eventContext.nowMs,
						subscriptionNextResetAt: secondsToMs(subscriptionPeriod.end),
						balanceSyncDb: db,
					},
				);
				for (const entitlementUpdate of pooledEntitlementUpdateById.values()) {
					await dependencies.updateCustomerEntitlement({
						ctx: transactionContext,
						id: entitlementUpdate.customerEntitlementId,
						updates: entitlementUpdate.updates,
					});
				}
				for (const optionsUpdate of pooledOptionsUpdateByCustomerProductId.values()) {
					await dependencies.updateCustomerProduct({
						ctx: transactionContext,
						cusProductId: optionsUpdate.customerProductId,
						updates: { options: optionsUpdate.options },
					});
				}
				const preparedCutover = await dependencies.executePooledBalanceOps({
					ctx: transactionContext,
					customerId,
					pooledBalanceOps,
					balanceSyncDb: db,
				});
				return { pooledResets, preparedCutover };
			},
			onTransactionFailure: () =>
				dependencies.deleteCachedFullCustomer({
					ctx,
					customerId,
					source: "pooled-invoice-renewal-transaction-failure",
					flushBalances: true,
				}),
		});
	if (preparedCutover) {
		await (
			dependencies.applyPooledBalanceCacheCutover ??
			applyPreparedPooledBalanceCacheCutover
		)({ ctx, prepared: preparedCutover });
	} else if (pooledResets.some((reset) => reset.applied)) {
		await dependencies.deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "pooled-invoice-reset",
		});
	}
};

export const processPrepaidPricesForInvoiceCreated = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: InvoiceCreatedContext;
}): Promise<void> =>
	processPrepaidPricesForInvoiceCreatedWithDependencies({ ctx, eventContext });
