import {
	type ApiCustomer,
	type ApiInvoiceV1,
	CusExpand,
	type Customer,
	type CustomerData,
	ErrCode,
	type Feature,
	type FullCustomer,
	type Invoice,
	sortCusEntsForDeduction,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	InvoiceService,
	processInvoice,
} from "@/internal/invoices/InvoiceService.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "./fullCustomerCacheUtils/deleteCachedFullCustomer.js";

export const updateCustomerDetails = async ({
	ctx,
	customer,
	customerData,
}: {
	ctx: AutumnContext;
	customer: FullCustomer | ApiCustomer;
	customerData?: CustomerData;
}) => {
	const { db, logger } = ctx;

	const idOrInternalId = customer.id || (customer as FullCustomer).internal_id;

	const updates: any = {};
	if (!customer.name && customerData?.name) {
		updates.name = customerData.name;
	}
	if (!customer.email && customerData?.email) {
		// Check that email is valid, if not skip...
		if (z.string().email().safeParse(customerData.email).error) {
			logger.info(`Invalid email ${customerData.email}, skipping update`);
		} else {
			updates.email = customerData.email;
		}
	}

	if (Object.keys(updates).length > 0) {
		logger.info(`Updating customer details:`, {
			data: updates,
		});

		await CusService.update({
			db,
			idOrInternalId,
			orgId: ctx.org.id,
			env: customer.env,
			update: updates,
		});
		customer = { ...customer, ...updates };

		// Invalidate cache after DB update
		await deleteCachedFullCustomer({
			customerId: idOrInternalId,
			ctx,
			source: "updateCustomerDetails",
		});

		return true;
	}
};

export const getCusInvoices = async ({
	db,
	internalCustomerId,
	invoices,
	limit = 10,
	withItems = false,
	features,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	invoices?: Invoice[];
	limit?: number;
	withItems?: boolean;
	features?: Feature[];
}): Promise<ApiInvoiceV1[]> => {
	const finalInvoices = notNullish(invoices)
		? invoices
		: await InvoiceService.list({
				db,
				internalCustomerId,
				limit,
			});

	const processedInvoices = finalInvoices!.map((i) =>
		processInvoice({
			invoice: i,
			withItems,
			features,
		}),
	);

	return processedInvoices;
};

// IMPORTANT FUNCTION
export const getCusEntsInFeatures = async ({
	customer,
	internalFeatureIds,
	logger,
	reverseOrder = false,
}: {
	customer: FullCustomer;
	internalFeatureIds?: string[];
	logger: any;
	reverseOrder?: boolean;
}) => {
	const cusProducts = customer.customer_products;

	// This is important, attaching customer_product to cus ent is used elsewhere, don't delete.
	let cusEnts = cusProducts.flatMap((cusProduct) => {
		return cusProduct.customer_entitlements.map((cusEnt) => ({
			...cusEnt,
			customer_product: cusProduct,
		}));
	});

	const cusPrices = cusProducts.flatMap((cusProduct) => {
		return cusProduct.customer_prices || [];
	});

	if (internalFeatureIds) {
		cusEnts = cusEnts.filter((cusEnt) =>
			internalFeatureIds.includes(cusEnt.entitlement.internal_feature_id),
		);
	}

	if (customer.entity) {
		const entity = customer.entity;
		cusEnts = cusEnts.filter(
			(cusEnt) =>
				nullish(cusEnt.customer_product.internal_entity_id) ||
				cusEnt.customer_product.internal_entity_id === entity.internal_id,
		);
	}

	sortCusEntsForDeduction({ cusEnts, reverseOrder });

	return { cusEnts, cusPrices };
};

export const parseCusExpand = (expand?: string): CusExpand[] => {
	if (expand) {
		const options = expand.split(",");
		const result: CusExpand[] = [];
		for (const option of options) {
			if (!Object.values(CusExpand).includes(option as CusExpand)) {
				throw new RecaseError({
					message: `Invalid expand option: ${option}`,
					code: ErrCode.InvalidExpand,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
			result.push(option as CusExpand);
		}
		return result;
	} else {
		return [];
	}
};

export const newCusToFullCus = ({ newCus }: { newCus: Customer }) => {
	const fullCus: FullCustomer = {
		...newCus,
		customer_products: [],
		entities: [],
	};

	return fullCus;
};
