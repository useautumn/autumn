import {
	BillingVersion,
	CollectionMethod,
	CusProductStatus,
	type Customer,
	type CustomerEntitlement,
	type CustomerPrice,
	customerProductHasActiveStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type { AddPlanOp } from "@autumn/shared/api/migrations/operations/customer/addPlan/index.js";
import { initCusEntitlement } from "@/internal/customers/add-product/initCusEnt.js";
import { getEntRelatedPrice } from "@/internal/products/entitlements/entitlementUtils.js";
import { PlanService } from "@/internal/products/PlanService.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { generateId } from "@/utils/genUtils.js";
import type { OperationProcessor } from "../types/index.js";
import { mergeAutumnBillingPlans } from "../utils/index.js";

export const processAddPlan: OperationProcessor<AddPlanOp> = async ({
	ctx,
	op,
	plan,
	projectedFullCustomer,
}) => {
	const product = await PlanService.getFull({
		db: ctx.db,
		idOrInternalId: op.plan_id,
		orgId: ctx.org.id,
		env: ctx.env,
		version: op.version,
		allowNotFound: true,
	});

	if (!product) {
		throw new Error(
			`add_plan: product "${op.plan_id}" (version ${op.version ?? "latest"}) not found in catalog`,
		);
	}

	const alreadyHasPlan = projectedFullCustomer.customer_products.some(
		(cp) =>
			cp.internal_product_id === product.internal_id &&
			customerProductHasActiveStatus(cp),
	);
	if (alreadyHasPlan)
		return {
			plan,
			projectedFullCustomer,
			matchedCustomerProducts: 0,
			billingContexts: [],
		};

	const cusProductId = generateId("cus_prod");
	const now = Date.now();
	const optionsList =
		op.feature_quantities?.map((fq) => ({
			feature_id: fq.feature_id,
			quantity: fq.quantity,
		})) ?? [];

	const customer: Pick<Customer, "internal_id" | "id"> = {
		internal_id: projectedFullCustomer.internal_id,
		id: projectedFullCustomer.id,
	};

	const customerEntitlements: CustomerEntitlement[] = product.entitlements.map(
		(entitlement) =>
			initCusEntitlement({
				entitlement,
				customer: customer as Customer,
				cusProductId,
				freeTrial: null,
				options: getEntOptions(optionsList, entitlement) || undefined,
				relatedPrice: getEntRelatedPrice(entitlement, product.prices),
				entities: [],
				carryExistingUsages: false,
				curCusProduct: undefined,
				replaceables: [],
			}),
	);

	const customerPrices: CustomerPrice[] = product.prices.map((price) => ({
		id: generateId("cus_price"),
		internal_customer_id: projectedFullCustomer.internal_id,
		customer_product_id: cusProductId,
		created_at: now,
		price_id: price.id || null,
	}));

	const newCusProduct: FullCusProduct = {
		id: cusProductId,
		internal_customer_id: projectedFullCustomer.internal_id,
		customer_id: projectedFullCustomer.id,
		internal_product_id: product.internal_id,
		product_id: product.id,
		created_at: now,
		updated_at: now,
		canceled: false,
		ended_at: null,
		status: CusProductStatus.Active,
		processor: projectedFullCustomer.processor ?? { type: "stripe" as const },
		starts_at: now,
		trial_ends_at: null,
		options: optionsList,
		free_trial_id: null,
		canceled_at: null,
		collection_method: CollectionMethod.ChargeAutomatically,
		subscription_ids: [],
		scheduled_ids: [],
		is_custom: false,
		quantity: 1,
		internal_entity_id: undefined,
		entity_id: undefined,
		api_semver: null,
		billing_version: BillingVersion.V1,
		external_id: null,
		product,
		customer_entitlements: customerEntitlements.map((ce) => {
			const entitlement = product.entitlements.find(
				(e) => e.id === ce.entitlement_id,
			);
			if (!entitlement)
				throw new Error(
					`add_plan: entitlement ${ce.entitlement_id} not found on product ${product.id}`,
				);
			return { ...ce, entitlement, replaceables: [], rollovers: [] };
		}),
		customer_prices: customerPrices.map((cp) => {
			const price = product.prices.find((p) => p.id === cp.price_id);
			if (!price)
				throw new Error(
					`add_plan: price ${cp.price_id} not found on product ${product.id}`,
				);
			return { ...cp, price };
		}),
	};

	return {
		plan: mergeAutumnBillingPlans({
			base: plan,
			incoming: {
				customerId: plan.customerId,
				insertCustomerProducts: [newCusProduct],
			},
		}),
		projectedFullCustomer,
		matchedCustomerProducts: 1,
		billingContexts: [],
	};
};
