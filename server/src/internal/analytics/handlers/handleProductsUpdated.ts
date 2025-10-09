import {
	ActionType,
	type AppEnv,
	type AuthType,
	createdAtToVersion,
	cusProductToProduct,
	type FullCusProduct,
	type FullProduct,
	notNullish,
	type Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import { ActionService } from "@/internal/analytics/ActionService.js";
import {
	constructAction,
	parseReqForAction,
} from "@/internal/analytics/actionUtils.js";
import { getSingleEntityResponse } from "@/internal/api/entities/getEntityUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getCustomerDetails } from "@/internal/customers/cusUtils/getCustomerDetails.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";

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
				org,
				env,
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
	db,
	logger,
	data,
}: {
	db: DrizzleCli;
	logger: any;
	data: {
		req: Partial<ExtendedRequest>;
		actionDetails: ActionDetails;
		internalCustomerId: string;
		org: Organization;
		env: AppEnv;
		customerId: string;
		product: FullProduct;
		scenario: string;
		cusProduct: FullCusProduct;
		scheduledCusProduct?: FullCusProduct;
		deletedCusProduct?: FullCusProduct;
	};
}) => {
	const {
		req,
		org,
		env,
		scenario,
		cusProduct,
		scheduledCusProduct,
		deletedCusProduct,
	} = data;

	// Product:
	const product = cusProduct.product;
	const fullProduct: FullProduct = cusProductToProduct({ cusProduct });
	const customer = await CusService.getFull({
		db,
		idOrInternalId: data.customerId || data.internalCustomerId,
		orgId: data.org.id,
		env: data.env,
		inStatuses: RELEVANT_STATUSES,
		entityId: cusProduct.internal_entity_id || undefined,
	});

	const features = await FeatureService.list({
		db,
		orgId: org.id,
		env,
	});

	const apiVersion = createdAtToVersion({
		createdAt: org.created_at || Date.now(),
	});

	const cusDetails = await getCustomerDetails({
		db,
		customer: customer,
		org,
		env,
		features,
		logger,
		cusProducts: customer.customer_products,
		expand: [],
		apiVersion,
	});

	const productRes = await getProductResponse({
		product: fullProduct,
		features,
	});

	try {
		if (req) {
			const action = constructAction({
				org,
				env,
				customer,
				entity: customer.entity,
				type: ActionType.CustomerProductsUpdated,
				req,
				properties: {
					product_id: product.id,
					customer_product_id: cusProduct.id,
					scenario,

					deleted_product_id: deletedCusProduct?.product.id,
					scheduled_product_id: scheduledCusProduct?.product.id,

					body: req.body,
				},
			});

			await ActionService.insert(db, action);
		} else {
			logger.warn(
				"products.updated, no req object found, skipping action insert",
			);
		}
	} catch (error: any) {
		// 23503 is for internal_customer_id not found
		if (error?.code !== "23503") {
			logger.error("Failed to log action to DB", {
				message: error.message,
				error: error,
			});
		}
	}

	let entityRes = null;
	if (notNullish(customer?.entity)) {
		entityRes = await getSingleEntityResponse({
			entityId: customer.entity!.id,
			org,
			env,
			fullCus: customer,
			entity: customer.entity!,
			features,
		});
	}

	// 2. Send Svix event
	await sendSvixEvent({
		org,
		env,
		eventType: "customer.products.updated",
		data: {
			scenario,
			customer: cusDetails,
			entity: entityRes,
			updated_product: productRes,
		},
	});
};
