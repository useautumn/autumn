import {
	ACTIVE_STATUSES,
	cusProductToProcessorType,
	type DfuFlashParams,
	type FeatureOptions,
	type FlashBillable,
	type FlashPlan,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	isOneOffPrice,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { CusService } from "@/internal/customers/CusService";
import { createNewCustomer } from "@/internal/customers/cusUtils/createNewCustomer";
import { ProductService } from "@/internal/products/ProductService";
import { resolveProcessorType } from "../compute/resolvers/processorResolver";
import {
	hydrateRevenueCatBillables,
	type RevenueCatHydration,
} from "./hydrate/hydrateRevenueCatBillable";
import {
	hydrateStripeBillables,
	type StripeHydration,
} from "./hydrate/hydrateStripeBillable";

export type FlashPlanContext = {
	plan: FlashPlan;
	processor: FlashBillable["processor"];
	processorType?: ProcessorType;
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	subscriptionIds: string[];
	billingCycleAnchor?: number;
	isAddOn: boolean;
	isRecurring: boolean;
	existingActiveCustomerProduct?: FullCusProduct;
	stripeHydration?: StripeHydration;
	revenueCatHydration?: RevenueCatHydration;
};

export type FlashContext = {
	customer_id: string;
	fullCustomer: FullCustomer;
	currentEpochMs: number;
	dryRun: boolean;
	params: DfuFlashParams;
	planContexts: FlashPlanContext[];
};

const upsertFullCustomer = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DfuFlashParams;
}): Promise<FullCustomer> => {
	const revenueCatIdentity = params.processors.find(
		(p) => p.type === "revenuecat",
	);

	const existing = await CusService.getFull({
		ctx,
		idOrInternalId: params.customer_id,
		inStatuses: undefined,
		withEntities: true,
		withSubs: true,
		allowNotFound: true,
	});
	if (existing) {
		// Self-migration: seed the RC app_user_id so Phase 1 webhooks resolve this
		// customer by it. Only-if-absent — never clobber an existing value.
		if (revenueCatIdentity && !existing.processors?.revenuecat?.id) {
			const processors = {
				...existing.processors,
				revenuecat: { id: revenueCatIdentity.id },
			};
			await CusService.update({
				ctx,
				idOrInternalId: existing.id ?? existing.internal_id,
				update: { processors },
			});
			existing.processors = processors;
		}
		return existing;
	}

	const stripeIdentity = params.processors.find((p) => p.type === "stripe");
	await createNewCustomer({
		ctx,
		customer: {
			id: params.customer_id,
			name: params.customer_data?.name,
			email: params.customer_data?.email,
			fingerprint: params.customer_data?.fingerprint,
			stripe_id: stripeIdentity?.id,
			processors: revenueCatIdentity
				? { revenuecat: { id: revenueCatIdentity.id } }
				: undefined,
			send_email_receipts: false,
		},
		createDefaultProducts: false,
	});

	return CusService.getFull({
		ctx,
		idOrInternalId: params.customer_id,
		withEntities: true,
		withSubs: true,
	});
};

const buildPlanContext = async ({
	ctx,
	fullCustomer,
	billable,
	plan,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	billable: FlashBillable;
	plan: FlashPlan;
}): Promise<FlashPlanContext> => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: plan.plan_id,
		orgId: ctx.org.id,
		env: ctx.env,
		version: plan.version,
		logger: ctx.logger,
	});

	const featureQuantities = setupFeatureQuantitiesContext({
		ctx,
		featureQuantitiesParams: { feature_quantities: plan.feature_quantities },
		fullProduct,
		initializeUndefinedQuantities: true,
	});

	const processorType = resolveProcessorType(billable.processor);

	const subscriptionIds = billable.link?.subscription_id
		? [billable.link.subscription_id]
		: [];

	const isRecurring = fullProduct.prices.some((price) => !isOneOffPrice(price));

	const existingActiveCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) =>
			ACTIVE_STATUSES.includes(customerProduct.status) &&
			customerProduct.internal_product_id === fullProduct.internal_id &&
			cusProductToProcessorType(customerProduct) ===
				(processorType ?? ProcessorType.Stripe),
	);

	return {
		plan,
		processor: billable.processor,
		processorType,
		fullProduct,
		featureQuantities,
		subscriptionIds,
		billingCycleAnchor: billable.billing_cycle_anchor,
		isAddOn: fullProduct.is_add_on === true,
		isRecurring,
		existingActiveCustomerProduct,
	};
};

export const setupFlashContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DfuFlashParams;
}): Promise<FlashContext> => {
	const fullCustomer = await upsertFullCustomer({ ctx, params });
	ctx.customerId = fullCustomer.id ?? params.customer_id;
	const currentEpochMs = Date.now();

	const planContexts: FlashPlanContext[] = [];
	for (const billable of params.billables) {
		for (const phase of billable.phases) {
			for (const plan of phase.plans) {
				planContexts.push(
					await buildPlanContext({ ctx, fullCustomer, billable, plan }),
				);
			}
		}
	}

	// Fill omitted fields from processors BEFORE status/balance resolution.
	const revenueCatAppUserId = params.processors.find(
		(p) => p.type === "revenuecat",
	)?.id;
	await Promise.all([
		hydrateStripeBillables({ ctx, planContexts }),
		hydrateRevenueCatBillables({
			ctx,
			planContexts,
			appUserId: revenueCatAppUserId,
		}),
	]);

	return {
		customer_id: params.customer_id,
		fullCustomer,
		currentEpochMs,
		dryRun: params.dry_run ?? false,
		params,
		planContexts,
	};
};
