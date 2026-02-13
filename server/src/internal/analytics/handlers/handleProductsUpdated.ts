import {
	AffectedResource,
	type ApiCustomerV5,
	type ApiEntityV2,
	type ApiPlanV1,
	ApiVersion,
	ApiVersionClass,
	type AppEnv,
	type AuthType,
	addToExpand,
	applyResponseVersionChanges,
	CusExpand,
	type CustomerLegacyData,
	cusProductToProduct,
	type EntityLegacyData,
	type FullCusProduct,
	type FullProduct,
	type Organization,
	type PlanLegacyData,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { parseCtxForAction } from "@/internal/analytics/actionUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getApiCustomerBase } from "../../customers/cusUtils/apiCusUtils/getApiCustomerBase";
import { getApiEntityBase } from "../../entities/entityUtils/apiEntityUtils/getApiEntityBase";
import { getPlanResponse } from "../../products/productUtils/productResponseUtils/getPlanResponse";

interface ActionDetails {
	request_id: string;
	method: string;
	path: string;
	timestamp: string;
	auth_type: AuthType;
	properties: any;
}

export const addProductsUpdatedWebhookTask = async ({
	ctx,
	org,
	env,
	customerId,
	internalCustomerId,
	cusProduct,
	scheduledCusProduct,
	deletedCusProduct,
	scenario,
}: {
	ctx?: AutumnContext;
	org: Organization;
	env: AppEnv;
	customerId: string | null;
	internalCustomerId: string;
	cusProduct: FullCusProduct;
	scheduledCusProduct?: FullCusProduct;
	deletedCusProduct?: FullCusProduct;
	scenario: string;
}) => {
	// Build action

	try {
		ctx?.logger.info(
			`[addProductsUpdatedWebhookTask] Sending webhook for product ${cusProduct.product.name}, scenario: ${scenario}`,
		);
		await addTaskToQueue({
			jobName: JobName.HandleProductsUpdated,
			payload: {
				reqCtx: ctx ? parseCtxForAction({ ctx }) : undefined,
				internalCustomerId,
				orgId: org.id,
				env,
				customerId,
				cusProduct,
				scheduledCusProduct,
				deletedCusProduct,
				scenario,
			},
		});
	} catch (error) {
		ctx?.logger.error(
			`Failed to add products updated webhook task to queue: ${error}`,
		);
	}
};

export const handleProductsUpdated = async ({
	ctx,
	data,
}: {
	ctx: AutumnContext;
	data: {
		reqCtx?: Partial<AutumnContext>;
		actionDetails: ActionDetails;
		internalCustomerId: string;
		// org: Organization;
		// env: AppEnv;
		customerId: string;
		product: FullProduct;
		scenario: string;
		cusProduct: FullCusProduct;
		scheduledCusProduct?: FullCusProduct;
		deletedCusProduct?: FullCusProduct;
	};
}) => {
	const { scenario, cusProduct } = data;
	const { db, org, env } = ctx;

	const fullProduct: FullProduct = cusProductToProduct({ cusProduct });
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: data.customerId || data.internalCustomerId,
		orgId: org.id,
		env: env,
		entityId: cusProduct.internal_entity_id || undefined,
		allowNotFound: true,
	});

	if (!fullCus) {
		ctx.logger.warn(
			`[handleProductsUpdated] Customer ${data.customerId} not found, skipping webhook`,
		);
		return;
	}

	const features = await FeatureService.list({
		db,
		orgId: org.id,
		env,
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
		fullCus,
		expandParams: {
			plan: true,
		},
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
	if (fullCus.entity) {
		const { apiEntity, legacyData } = await getApiEntityBase({
			ctx,
			entity: fullCus.entity,
			fullCus,
		});

		entity = applyResponseVersionChanges<ApiEntityV2, EntityLegacyData>({
			input: apiEntity,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Entity,
			legacyData,
			ctx,
		});
	}

	// 2. Send Svix event
	ctx.logger.info(
		`sending customer.products.updated webhook, customer ID: ${data.customerId}, entity ID: ${fullCus.entity?.id || "none"}`,
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
