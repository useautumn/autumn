import {
	type ApiInvoiceV1,
	type Customer,
	type CustomerData,
	CustomerExpand,
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

export const updateCustomerDetails = async ({
	ctx,
	fullCustomer,
	customerData,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerData?: CustomerData;
}) => {
	const { logger } = ctx;

	const idOrInternalId = fullCustomer.id || fullCustomer.internal_id;

	const updates: Partial<Customer> = {};
	if (!fullCustomer.name && customerData?.name) {
		updates.name = customerData.name;
	}
	if (!fullCustomer.email && customerData?.email) {
		// Check that email is valid, if not skip...
		if (z.string().email().safeParse(customerData.email).error) {
			logger.info(`Invalid email ${customerData.email}, skipping update`);
		} else {
			updates.email = customerData.email;
		}
	}
	// Update send_email_receipts if explicitly provided
	if (
		customerData?.send_email_receipts !== undefined &&
		fullCustomer.send_email_receipts !== updates.send_email_receipts
	) {
		updates.send_email_receipts = customerData.send_email_receipts;
	}

	if (Object.keys(updates).length > 0) {
		logger.info(`Updating customer details:`, {
			data: updates,
		});

		await CusService.update({
			ctx,
			idOrInternalId,
			update: updates,
		});

		fullCustomer = { ...fullCustomer, ...updates };

		return true;
	}
};

const getCusInvoices = async ({
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
const getCusEntsInFeatures = async ({
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

const parseCusExpand = (expand?: string): CustomerExpand[] => {
	if (expand) {
		const options = expand.split(",");
		const result: CustomerExpand[] = [];
		for (const option of options) {
			if (!Object.values(CustomerExpand).includes(option as CustomerExpand)) {
				throw new RecaseError({
					message: `Invalid expand option: ${option}`,
					code: ErrCode.InvalidExpand,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
			result.push(option as CustomerExpand);
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
		extra_customer_entitlements: [],
		entities: [],
	};

	return fullCus;
};
