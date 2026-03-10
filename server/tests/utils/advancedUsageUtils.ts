import assert from "node:assert";
import type { Feature, ProductV2 } from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { Decimal } from "decimal.js";
import { getPriceForOverage } from "@/internal/products/prices/priceUtils.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";

const PRECISION = 10;
const CREDIT_MULTIPLIER = 100000;

export const getCreditsUsed = (
	creditSystem: Feature,
	meteredFeatureId: string,
	value: number,
) => {
	const schemaItem = creditSystem.config.schema.find(
		(item: any) => item.metered_feature_id === meteredFeatureId,
	);

	return new Decimal(value).mul(schemaItem.credit_amount).toNumber();
};

export const checkCreditBalance = async ({
	customerId,
	featureId,
	totalCreditsUsed,
	originalAllowance,
}: {
	customerId: string;
	featureId: string;
	totalCreditsUsed: number;
	originalAllowance: number;
}) => {
	// Check entitled
	const { allowed, balanceObj }: any = await AutumnCli.entitled(
		customerId,
		featureId,
		true,
	);

	try {
		assert.equal(allowed, true);
		assert.equal(
			balanceObj.balance,
			new Decimal(originalAllowance).minus(totalCreditsUsed).toNumber(),
		);
	} catch (error) {
		console.group();
		console.log("   - Total credits used: ", totalCreditsUsed);
		console.log("   - Original allowance: ", originalAllowance);
		console.log(
			"   - Expected balance: ",
			originalAllowance - totalCreditsUsed,
		);
		console.log("   - Actual balance: ", balanceObj.balance);
		console.groupEnd();
		throw error;
	}
};

export const checkUsageInvoiceAmount = async ({
	invoices,
	totalUsage,
	product,
	featureId,
	invoiceIndex,
	includeBase = true,
}: {
	invoices: any;
	totalUsage: number;
	product: any;
	featureId: string;
	invoiceIndex?: number;
	includeBase?: boolean;
}) => {
	const featureEntitlement: any = Object.values(product.entitlements).find(
		(entitlement: any) => entitlement.feature_id === featureId,
	);

	const meteredPrice = product.prices[product.prices.length - 1];
	const overage = new Decimal(totalUsage)
		.minus(featureEntitlement.allowance)
		.toNumber();
	const overagePrice = getPriceForOverage({ price: meteredPrice, overage });

	let basePrice = 0;
	if (includeBase && product.prices.length > 1) {
		basePrice = product.prices[0].config.amount;
	}

	const totalPrice = new Decimal(overagePrice.toFixed(2))
		.plus(basePrice)
		.toNumber();

	try {
		for (let i = 0; i < invoices.length; i++) {
			const invoice = invoices[i];
			if (invoice.total === totalPrice) {
				invoiceIndex = i;
				assert.equal(invoice.product_ids[0], product.id);
				return;
			}
		}
		assert.fail("No invoice found with correct total price");
	} catch (error) {
		console.group();
		console.log("Check usage invoice amount failed");
		console.log("- Base price: ", basePrice);
		console.log("- Overage price: ", overagePrice);
		console.log(
			`Expected to find invoice with total of ${totalPrice} and product id ${product.id}`,
		);
		// console.log("Instead got: ", invoices[invoiceIndex || 0].total);
		console.log("Last 3 invoices", invoices.slice(-3));
		console.group();
		throw error;
	}
};

/**
 * V2 wrapper for checkUsageInvoiceAmount that accepts ProductV2
 * Converts ProductV2 → ProductV1 internally, then calls original helper
 */
export const checkUsageInvoiceAmountV2 = async ({
	invoices,
	totalUsage,
	product,
	featureId,
	invoiceIndex,
	includeBase = true,
}: {
	invoices: any;
	totalUsage: number;
	product: ProductV2;
	featureId: string;
	invoiceIndex?: number;
	includeBase?: boolean;
}) => {
	// Convert V2 → V1 using production utilities
	const productV1 = convertProductV2ToV1({
		productV2: product,
		orgId: ctx.org.id,
		features: ctx.features,
	});

	// Call original helper with converted product
	return checkUsageInvoiceAmount({
		invoices,
		totalUsage,
		product: productV1,
		featureId,
		invoiceIndex,
		includeBase,
	});
};
