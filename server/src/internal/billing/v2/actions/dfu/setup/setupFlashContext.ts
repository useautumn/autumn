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
	isCusProductOnEntity,
	isCustomerProductCustomerScoped,
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
	// Undefined = customer-level scope; set = plan is scoped to this entity.
	entityId?: string;
	internalEntityId?: string;
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

// Collapse the `plan` shorthand into phases so all downstream code sees phases only.
const normalizeBillable = (billable: FlashBillable): FlashBillable => {
	if (!billable.plan) return billable;
	const { plan, ...rest } = billable;
	return { ...rest, phases: [{ starts_at: "now", plans: [plan] }] };
};

const normalizeFlashParams = (params: DfuFlashParams): DfuFlashParams => ({
	...params,
	billables: params.billables.map(normalizeBillable),
	entities: params.entities?.map((entity) => ({
		...entity,
		billables: entity.billables.map(normalizeBillable),
	})),
});

const upsertFullCustomer = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DfuFlashParams;
}): Promise<FullCustomer> => {
	const revenueCatIdentity = params.processors?.find(
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
		// dry_run must not persist anything; return existing state so previews
		// compute from actual persisted data (not hypothetical proposed updates).
		if (params.dry_run) return existing;

		const update: Parameters<typeof CusService.update>[0]["update"] = {};

		// Self-migration: seed the RC app_user_id so Phase 1 webhooks resolve this
		// customer by it. Only-if-absent — never clobber an existing value.
		if (revenueCatIdentity && !existing.processors?.revenuecat?.id) {
			update.processors = {
				...existing.processors,
				revenuecat: { id: revenueCatIdentity.id, aliases: [] },
			};
		}

		const customerData = params.customer_data;
		if (customerData?.name !== undefined && customerData.name !== existing.name)
			update.name = customerData.name;
		if (
			customerData?.email !== undefined &&
			customerData.email !== existing.email
		)
			update.email = customerData.email;
		if (
			customerData?.fingerprint !== undefined &&
			customerData.fingerprint !== existing.fingerprint
		)
			update.fingerprint = customerData.fingerprint;

		if (Object.keys(update).length > 0) {
			await CusService.update({
				ctx,
				idOrInternalId: existing.id ?? existing.internal_id,
				update,
			});
			Object.assign(existing, update);
		}
		return existing;
	}

	const stripeIdentity = params.processors?.find((p) => p.type === "stripe");
	await createNewCustomer({
		ctx,
		customer: {
			id: params.customer_id,
			name: params.customer_data?.name,
			email: params.customer_data?.email,
			fingerprint: params.customer_data?.fingerprint,
			stripe_id: stripeIdentity?.id,
			processors: revenueCatIdentity
				? { revenuecat: { id: revenueCatIdentity.id, aliases: [] } }
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
	entityId,
	internalEntityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	billable: FlashBillable;
	plan: FlashPlan;
	entityId?: string;
	internalEntityId?: string;
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

	// Match only within this plan's scope so entity products don't cross into
	// customer-level (and vice-versa).
	const matchesScope = (customerProduct: FullCusProduct): boolean =>
		internalEntityId
			? isCusProductOnEntity({ cusProduct: customerProduct, internalEntityId })
			: isCustomerProductCustomerScoped(customerProduct);

	const existingActiveCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) =>
			ACTIVE_STATUSES.includes(customerProduct.status) &&
			customerProduct.internal_product_id === fullProduct.internal_id &&
			cusProductToProcessorType(customerProduct) ===
				(processorType ?? ProcessorType.Stripe) &&
			matchesScope(customerProduct),
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
		entityId,
		internalEntityId,
		existingActiveCustomerProduct,
	};
};

export const setupFlashContext = async ({
	ctx,
	params: rawParams,
}: {
	ctx: AutumnContext;
	params: DfuFlashParams;
}): Promise<FlashContext> => {
	const params = normalizeFlashParams(rawParams);
	const fullCustomer = await upsertFullCustomer({ ctx, params });
	ctx.customerId = fullCustomer.id ?? params.customer_id;
	const currentEpochMs = Date.now();

	const planContexts: FlashPlanContext[] = [];
	const buildScopedPlanContexts = async ({
		billables,
		entityId,
		internalEntityId,
	}: {
		billables: FlashBillable[];
		entityId?: string;
		internalEntityId?: string;
	}) => {
		for (const billable of billables) {
			for (const phase of billable.phases ?? []) {
				for (const plan of phase.plans) {
					planContexts.push(
						await buildPlanContext({
							ctx,
							fullCustomer,
							billable,
							plan,
							entityId,
							internalEntityId,
						}),
					);
				}
			}
		}
	};

	await buildScopedPlanContexts({ billables: params.billables });
	for (const entity of params.entities ?? []) {
		const internalEntityId = fullCustomer.entities?.find(
			(e) => e.id === entity.entity_id,
		)?.internal_id;
		await buildScopedPlanContexts({
			billables: entity.billables,
			entityId: entity.entity_id,
			internalEntityId,
		});
	}

	// Fill omitted fields from processors BEFORE status/balance resolution.
	const revenueCatAppUserId = params.processors?.find(
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
