import {
	type AppEnv,
	type CreateCustomer,
	CreateCustomerSchema,
	type Customer,
	ErrCode,
	type FullProduct,
	type Organization,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { createNewCustomer } from "../cusUtils/createNewCustomer.js";

export const initStripeCusAndProducts = async ({
	db,
	org,
	env,
	customer,
	products,
	logger,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customer: Customer;
	products: FullProduct[];
	logger: any;
}) => {
	const batchInit: any[] = [
		createStripeCusIfNotExists({
			db,
			org,
			env,
			customer,
			logger,
		}),
	];

	for (const product of products) {
		batchInit.push(
			initProductInStripe({
				db,
				org,
				env,
				logger,
				product,
			}),
		);
	}

	await Promise.all(batchInit);
};

const handleIdIsNull = async ({
	req,
	newCus,
	createDefaultProducts,
}: {
	req: ExtendedRequest;
	newCus: CreateCustomer;
	createDefaultProducts?: boolean;
}) => {
	const { db, org, env, logger } = req;

	// 1. ID is null
	if (!newCus.email) {
		throw new RecaseError({
			message: "Email is required when `id` is null",
			code: ErrCode.InvalidCustomer,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// 2. Check if email already exists
	const existingCustomers = await CusService.getByEmail({
		db,
		email: newCus.email,
		orgId: org.id,
		env,
	});

	if (existingCustomers.length > 0) {
		for (const existingCustomer of existingCustomers) {
			if (existingCustomer.id === null) {
				logger.info(
					`Create customer by email: ${newCus.email} already exists, skipping...`,
				);
				return existingCustomer;
			}
		}

		throw new RecaseError({
			message: `Email ${newCus.email} already exists`,
			code: ErrCode.DuplicateCustomerId,
			statusCode: StatusCodes.CONFLICT,
		});
	}

	const createdCustomer = await createNewCustomer({
		req,
		customer: newCus,
		createDefaultProducts,
	});

	return createdCustomer;
};

// CAN ALSO USE DURING MIGRATION...
export const handleCreateCustomerWithId = async ({
	req,
	newCus,
	createDefaultProducts = true,
}: {
	req: ExtendedRequest;
	newCus: CreateCustomer;
	createDefaultProducts?: boolean;
}) => {
	const { db, org, env, logger } = req;

	if (!newCus.id)
		throw new Error("Calling handleCreateCustomerWithId with id null");

	const existingCustomer = await CusService.get({
		db,
		idOrInternalId: newCus.id,
		orgId: org.id,
		env,
	});

	if (existingCustomer) {
		logger.info(
			`Customer already exists, skipping creation: ${existingCustomer.id}`,
		);
		return existingCustomer;
	}

	// 2. Check if email exists
	if (notNullish(newCus.email) && newCus.email !== "") {
		const cusWithEmail = await CusService.getByEmail({
			db,
			email: newCus.email,
			orgId: org.id,
			env,
		});

		if (cusWithEmail.length === 1 && cusWithEmail[0].id === null) {
			logger.info(
				`POST /customers, email ${newCus.email} and ID null found, updating ID to ${newCus.id} (org: ${org.slug})`,
			);

			const updatedCustomer = await CusService.update({
				db,
				idOrInternalId: cusWithEmail[0].internal_id,
				orgId: org.id,
				env,
				update: {
					id: newCus.id,
					name: newCus.name,
					fingerprint: newCus.fingerprint,
				},
			});

			return updatedCustomer as Customer;
		}
	}

	// 2. Handle email step...
	return await createNewCustomer({
		req,
		customer: newCus,
		createDefaultProducts,
	});
};

export const handleCreateCustomer = async ({
	req,
	cusData,
	createDefaultProducts = true,
}: {
	req: ExtendedRequest;
	cusData: CreateCustomer;
	createDefaultProducts?: boolean;
}) => {
	const newCus = CreateCustomerSchema.parse(cusData);

	console.log("Create default products:", createDefaultProducts);

	// 1. If no ID and email is not NULL
	let createdCustomer: Customer;

	if (newCus.id === null) {
		createdCustomer = await handleIdIsNull({
			req,
			newCus,
			createDefaultProducts,
		});
	} else {
		createdCustomer = await handleCreateCustomerWithId({
			req,
			newCus,
			createDefaultProducts,
		});
	}

	return createdCustomer;
};
