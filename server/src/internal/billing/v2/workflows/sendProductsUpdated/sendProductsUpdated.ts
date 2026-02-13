/**
 * Workflow: SendProductsUpdated
 *
 * Sends customer.products.updated webhook when billing plan executes.
 * Uses lean payload - fetches data from DB instead of receiving full objects.
 */

import {
	AffectedResource,
	type ApiCustomerV5,
	type ApiEntityV2,
	type ApiPlanV1,
	ApiVersion,
	ApiVersionClass,
	addToExpand,
	applyResponseVersionChanges,
	CusExpand,
	type CustomerLegacyData,
	cusProductToProduct,
	type EntityLegacyData,
	enrichFullCustomerWithEntity,
	findCustomerProductById,
	type PlanLegacyData,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getApiEntityBase } from "@/internal/entities/entityUtils/apiEntityUtils/getApiEntityBase.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import type { SendProductsUpdatedPayload } from "@/queue/workflows.js";

export const sendProductsUpdated = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: SendProductsUpdatedPayload;
}) => {
	const { db, org, env, features, logger } = ctx;
	const { customerProductId, scenario, customerId } = payload;

	// Fetch FullCustomer
	const fullCustomer = await CusService.getFull({
		db,
		idOrInternalId: customerId ?? "",
		orgId: org.id,
		env,
		withEntities: true,
		withSubs: true,
		allowNotFound: true,
	});

	const customerProduct = findCustomerProductById({
		fullCustomer,
		customerProductId,
	});

	if (!fullCustomer) {
		logger.warn(`[sendProductsUpdated] Customer ${customerId ?? ""} not found`);
		return;
	}

	if (!customerProduct) {
		logger.warn(
			`[sendProductsUpdated] Customer product ${customerProductId} not found`,
		);
		return;
	}

	const fullProduct = cusProductToProduct({ cusProduct: customerProduct });

	enrichFullCustomerWithEntity({
		fullCustomer,
		internalEntityId: customerProduct.internal_entity_id ?? "",
	});

	ctx.apiVersion = new ApiVersionClass(ApiVersion.V1_2);

	if (ctx.apiVersion.lte(ApiVersion.V1_2)) {
		ctx = addToExpand({
			ctx,
			add: [
				CusExpand.BalancesFeature,
				CusExpand.SubscriptionsPlan,
				CusExpand.PurchasesPlan,
			],
		});
	}

	const { apiCustomer, legacyData: cusLegacyData } = await getApiCustomerBase({
		ctx,
		fullCus: fullCustomer,
	});

	const versionedCustomer = applyResponseVersionChanges<
		ApiCustomerV5,
		CustomerLegacyData
	>({
		input: apiCustomer,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		legacyData: cusLegacyData,
		ctx,
	});

	const apiPlan = await getPlanResponse({
		product: fullProduct,
		features,
	});

	const versionedPlan = applyResponseVersionChanges<ApiPlanV1, PlanLegacyData>({
		input: apiPlan,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Product,
		legacyData: {
			features: ctx.features,
		},
		ctx,
	});

	let entity: unknown | undefined;
	if (fullCustomer.entity) {
		const { apiEntity, legacyData } = await getApiEntityBase({
			ctx,
			entity: fullCustomer.entity,
			fullCus: fullCustomer,
		});

		entity = applyResponseVersionChanges<ApiEntityV2, EntityLegacyData>({
			input: apiEntity,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Entity,
			legacyData,
			ctx,
		});
	}

	ctx.logger.info(
		`[sendProductsUpdated] Sending webhook for customer ${customerId}, product ${fullProduct.name}, scenario: ${scenario}`,
	);

	await sendSvixEvent({
		org,
		env,
		eventType: "customer.products.updated",
		data: {
			scenario,
			customer: versionedCustomer,
			entity,
			updated_product: versionedPlan,
		},
	});
};
