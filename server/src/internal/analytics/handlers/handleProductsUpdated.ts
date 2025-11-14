import {
	AffectedResource,
	type ApiCustomer,
	type ApiPlan,
	ApiVersion,
	type AppEnv,
	type AuthType,
	addToExpand,
	applyResponseVersionChanges,
	CusExpand,
	type CustomerLegacyData,
	cusProductToProduct,
	type FullCusProduct,
	type FullProduct,
	type Organization,
	type PlanLegacyData,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { parseReqForAction } from "@/internal/analytics/actionUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { getApiCustomerBase } from "../../customers/cusUtils/apiCusUtils/getApiCustomerBase";
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
	req,
	org,
	env,
	customerId,
	internalCustomerId,
	cusProduct,
	scheduledCusProduct,
	deletedCusProduct,
	scenario,
	logger,
}: {
	req?: ExtendedRequest;
	org: Organization;
	env: AppEnv;
	customerId: string | null;
	internalCustomerId: string;
	cusProduct: FullCusProduct;
	scheduledCusProduct?: FullCusProduct;
	deletedCusProduct?: FullCusProduct;
	scenario: string;
	logger: any;
}) => {
	// Build action

	try {
		await addTaskToQueue({
			jobName: JobName.HandleProductsUpdated,
			payload: {
				req: req ? parseReqForAction(req) : undefined,
				internalCustomerId,
				orgId: org.id,
				env,
				// org,
				// env,
				customerId,
				cusProduct,
				scheduledCusProduct,
				deletedCusProduct,
				scenario,
			},
		});
	} catch (error) {
		logger.error("Failed to add products updated webhook task to queue", {
			error,
			org_slug: org.slug,
			org_id: org.id,
			env,
			internalCustomerId,
			productId: cusProduct.product.id,
			cusProductId: cusProduct.id,
			// productId: product.id,
		});
	}
};

export const handleProductsUpdated = async ({
	ctx,
	data,
}: {
	ctx: AutumnContext;
	data: {
		req: Partial<ExtendedRequest>;
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
	});

	const features = await FeatureService.list({
		db,
		orgId: org.id,
		env,
	});

	if (ctx.apiVersion.lte(ApiVersion.V1_2)) {
		addToExpand({
			ctx,
			add: [CusExpand.BalancesFeature, CusExpand.SubscriptionsPlan],
		});
	}

	const { apiCustomer, legacyData: cusLegacyData } = await getApiCustomerBase({
		ctx,
		fullCus,
	});

	const versionedCustomer = applyResponseVersionChanges<
		ApiCustomer,
		CustomerLegacyData
	>({
		input: apiCustomer,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		legacyData: cusLegacyData,
	});

	const apiPlan = await getPlanResponse({
		product: fullProduct,
		features,
	});

	const versionedPlan = applyResponseVersionChanges<ApiPlan, PlanLegacyData>({
		input: apiPlan,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Product,
		legacyData: {
			features: ctx.features,
		},
	});

	// console.log(`API version: ${ctx.apiVersion.value}`);
	// console.log(`Versioned customer:`, versionedCustomer);
	// console.log(`Versioned plan:`, versionedPlan);

	// let entityRes = null;
	// if (notNullish(customer?.entity)) {
	// 	entityRes = await getSingleEntityResponse({
	// 		ctx,
	// 		entityId: customer.entity!.id,
	// 		fullCus: customer,
	// 		entity: customer.entity!,
	// 	});
	// }

	console.log("Sending svix event for products updated");

	// 2. Send Svix event
	await sendSvixEvent({
		org,
		env,
		eventType: "customer.products.updated",
		data: {
			scenario,
			customer: versionedCustomer,
			updated_product: versionedPlan,
		},
	});
};
