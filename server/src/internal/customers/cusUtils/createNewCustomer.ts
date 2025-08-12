import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { addCustomerCreatedTask } from "@/internal/analytics/handlers/handleCustomerCreated.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
	Organization,
	CreateCustomer,
	CreateCustomerSchema,
	ErrCode,
	BillingInterval,
	AttachScenario,
	FullCustomer,
	FullProduct,
	FreeTrial,
} from "@autumn/shared";
import { AppEnv, Customer } from "@autumn/shared";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { handleAddProduct } from "../attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { CusService } from "../CusService.js";
import { initStripeCusAndProducts } from "../handlers/handleCreateCustomer.js";
import { generateId } from "@/utils/genUtils.js";

import {
	newCusToAttachParams,
	newCusToInsertParams,
} from "../attach/attachUtils/attachParams/convertToParams.js";
import { FreeTrialService } from "@/internal/products/free-trials/FreeTrialService.js";

export const createNewCustomer = async ({
	req,
	customer,
	nextResetAt,
	createDefaultProducts = true,
}: {
	req: ExtendedRequest;
	customer: CreateCustomer;
	nextResetAt?: number;
	createDefaultProducts?: boolean;
}) => {
	const { db, org, env, logger } = req;

	logger.info(
		`Creating customer: ${customer.email || customer.id}, org: ${org.slug}`
	);

	let [defaultProds, freeTrialData] = await Promise.all([
		ProductService.listDefault({
			db,
			orgId: org.id,
			env,
		}),
		FreeTrialService.listByOrgId({
			db,
			orgId: org.id,
			env,
		}),
	]);

	let resolvedFreeTrialProduct = null;

	// Check if we have a default free trial
	if (freeTrialData?.trial?.is_default_trial) {
		resolvedFreeTrialProduct = await ProductService.getFull({
			db,
			idOrInternalId: freeTrialData.product.internal_id,
			orgId: org.id,
			env,
		});
	}
	// Validate and convert the free trial data to match the expected interface
	const trialData = freeTrialData.trial;
	console.log(freeTrialData);
	process.exit(0);

	const nonFreeProds = defaultProds.filter((p) => !isFreeProduct(p.prices));
	const freeProds = defaultProds.filter((p) => isFreeProduct(p.prices));

	const parsedCustomer = CreateCustomerSchema.parse(customer);

	console.log(freeTrialData, "freeTrialData");
	console.log(resolvedFreeTrialProduct, "resolvedFreeTrialProduct");
	console.log(trialData, "trialData");

	const customerData: Customer = {
		...parsedCustomer,

		name: parsedCustomer.name || "",
		email:
			(nonFreeProds.length > 0 || trialData) && !parsedCustomer.email
				? `${parsedCustomer.id}-${org.id}@invoices.useautumn.com`
				: parsedCustomer.email || "",

		metadata: parsedCustomer.metadata || {},
		internal_id: generateId("cus"),
		org_id: org.id,
		created_at: Date.now(),
		env,
		processor: parsedCustomer.stripe_id
			? {
					id: parsedCustomer.stripe_id,
					type: "stripe",
				}
			: undefined,
	};

	// Check if stripeCli exists
	if (nonFreeProds.length > 0) {
		createStripeCli({
			org,
			env,
		});

		if (!customerData?.email) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message:
					"Customer email is required to attach default product with prices",
			});
		}
	}

	const newCustomer = await CusService.insert({
		db,
		data: customerData,
	});

	if (!newCustomer) {
		throw new RecaseError({
			code: ErrCode.InternalError,
			message: "CusService.insert returned null",
		});
	}

	if (!createDefaultProducts) {
		console.log("Not creating default products");
		return newCustomer;
	}

	// If there's a default trial, attach it on stripe with proper params and then add it to autumn
	if (trialData && resolvedFreeTrialProduct && trialData.is_default_trial) {
		console.log("Running free trial flow");
		await addCustomerCreatedTask({
			req,
			internalCustomerId: newCustomer.internal_id,
			org,
			env,
		});

		const stripeCli = createStripeCli({ org, env });

		// Initialize stripe customer (needed for free trial attachment)
		await initStripeCusAndProducts({
			db,
			org,
			env,
			customer: newCustomer,
			products: [],
			logger,
		});

		await handleAddProduct({
			req,
			attachParams: newCusToAttachParams({
				req,
				newCus: newCustomer as FullCustomer,
				products: [resolvedFreeTrialProduct],
				stripeCli,
				freeTrial: resolvedFreeTrialProduct.free_trial!,
			}),
		});

		// Add the free trial product to Autumn with the free trial data
		// await createFullCusProduct({
		// 	db,
		// 	attachParams: newCusToInsertParams({
		// 		req,
		// 		newCus: newCustomer,
		// 		product: resolvedFreeTrialProduct,
		// 		freeTrial: resolvedFreeTrialProduct.free_trial!,
		// 	}),
		// 	nextResetAt,
		// 	anchorToUnix: org.config.anchor_start_of_month
		// 		? getNextStartOfMonthUnix({
		// 				interval: BillingInterval.Month,
		// 				intervalCount: 1,
		// 			})
		// 		: undefined,
		// 	scenario: AttachScenario.New,
		// 	logger,
		// });
	} else {
		await addCustomerCreatedTask({
			req,
			internalCustomerId: newCustomer.internal_id,
			org,
			env,
		});

		if (nonFreeProds.length > 0) {
			const stripeCli = createStripeCli({ org, env });

			await initStripeCusAndProducts({
				db,
				org,
				env,
				customer: newCustomer,
				products: nonFreeProds,
				logger,
			});

			await handleAddProduct({
				req,
				attachParams: newCusToAttachParams({
					req,
					newCus: newCustomer as FullCustomer,
					products: nonFreeProds,
					stripeCli,
				}),
			});
		}

		for (const product of freeProds) {
			await createFullCusProduct({
				db,
				attachParams: newCusToInsertParams({
					req,
					newCus: newCustomer,
					product,
				}),
				nextResetAt,
				anchorToUnix: org.config.anchor_start_of_month
					? getNextStartOfMonthUnix({
							interval: BillingInterval.Month,
							intervalCount: 1,
						})
					: undefined,
				scenario: AttachScenario.New,
				logger,
			});
		}
	}

	return newCustomer;
};
