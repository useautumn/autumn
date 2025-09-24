import {
	AttachScenario,
	BillingInterval,
	type CreateCustomer,
	CreateCustomerSchema,
	type Customer,
	ErrCode,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import { addCustomerCreatedTask } from "@/internal/analytics/handlers/handleCustomerCreated.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { createFullCusProduct } from "../add-product/createFullCusProduct.js";
import { handleAddProduct } from "../attach/attachFunctions/addProductFlow/handleAddProduct.js";
import {
	newCusToAttachParams,
	newCusToInsertParams,
} from "../attach/attachUtils/attachParams/convertToParams.js";
import { getDefaultAttachConfig } from "../attach/attachUtils/getAttachConfig.js";
import { CusService } from "../CusService.js";
import { initStripeCusAndProducts } from "../handlers/handleCreateCustomer.js";

export const getGroupToDefaultProd = async ({
	defaultProds,
}: {
	defaultProds: FullProduct[];
}) => {
	const groups = new Set(defaultProds.map((p) => p.group));
	const groupToDefaultProd: Record<string, FullProduct> = {};

	for (const group of groups) {
		const defaultProdsInGroup = defaultProds.filter((p) => p.group === group);

		if (defaultProdsInGroup.length === 0) continue;

		defaultProdsInGroup.sort((a, b) => {
			// 1. If a is default trial, go first
			if (isDefaultTrialFullProduct({ product: a })) return -1;

			if (!isFreeProduct(a.prices)) return -1;

			return 0;
		});

		groupToDefaultProd[group] = defaultProdsInGroup[0];
	}

	return groupToDefaultProd;
};

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
		`Creating customer: ${customer.email || customer.id}, org: ${org.slug}`,
	);

	const defaultProds = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	const nonFreeProds = defaultProds.filter(
		(p) =>
			!isFreeProduct(p.prices) && !isDefaultTrialFullProduct({ product: p }),
	);
	// const freeProds = defaultProds.filter((p) => isFreeProduct(p.prices));
	// const defaultPaidTrialProd = nonFreeProds.find((p) =>
	//   isDefaultTrialFullProduct({ product: p })
	// );

	const parsedCustomer = CreateCustomerSchema.parse(customer);

	const internalId = generateId("cus");
	const customerData: Customer = {
		...parsedCustomer,

		name: parsedCustomer.name || "",
		email:
			nonFreeProds.length > 0 && !parsedCustomer.email
				? `${parsedCustomer.id || internalId}@invoices.useautumn.com`
				: parsedCustomer.email || "",

		metadata: parsedCustomer.metadata || {},
		internal_id: internalId,
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
		createStripeCli({ org, env });
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
		return newCustomer;
	}

	await addCustomerCreatedTask({
		req,
		internalCustomerId: newCustomer.internal_id,
		org,
		env,
	});

	const groupToDefaultProd = await getGroupToDefaultProd({
		defaultProds,
	});

	for (const group in groupToDefaultProd) {
		const defaultProd = groupToDefaultProd[group];

		if (!isFreeProduct(defaultProd.prices)) {
			let stripeCli = null;

			stripeCli = createStripeCli({ org, env });
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
				config: {
					...getDefaultAttachConfig(),
					requirePaymentMethod: false,
				},
				attachParams: newCusToAttachParams({
					req,
					newCus: newCustomer as FullCustomer,
					products: [defaultProd],
					stripeCli,
					freeTrial: defaultProd.free_trial || null,
				}),
			});
		} else {
			await createFullCusProduct({
				db,
				attachParams: newCusToInsertParams({
					req,
					newCus: newCustomer,
					product: defaultProd,
					freeTrial: defaultProd?.free_trial || null,
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

	// if (nonFreeProds.length > 0) {
	//   const stripeCli = createStripeCli({ org, env });

	// await initStripeCusAndProducts({
	//   db,
	//   org,
	//   env,
	//   customer: newCustomer,
	//   products: nonFreeProds,
	//   logger,
	// });

	//   await handleAddProduct({
	//     req,
	//     attachParams: newCusToAttachParams({
	//       req,
	//       newCus: newCustomer as FullCustomer,
	//       products: nonFreeProds,
	//       stripeCli,
	//       freeTrial: defaultPaidTrialProd?.free_trial || null,
	//     }),
	//   });
	// }

	// if (!defaultPaidTrialProd) {
	//   for (const product of freeProds) {
	//     await createFullCusProduct({
	// db,
	// attachParams: newCusToInsertParams({
	//   req,
	//   newCus: newCustomer,
	//   product,
	// }),
	// nextResetAt,
	// anchorToUnix: org.config.anchor_start_of_month
	//   ? getNextStartOfMonthUnix({
	//       interval: BillingInterval.Month,
	//       intervalCount: 1,
	//     })
	//   : undefined,
	// scenario: AttachScenario.New,
	// logger,
	//     });
	//   }
	// }

	return newCustomer;
};
