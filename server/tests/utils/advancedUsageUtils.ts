import { getPriceForOverage } from "@/internal/products/prices/priceUtils.js";
import assert from "assert";
import { expect } from "chai";
import { Decimal } from "decimal.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { creditSystems } from "tests/global.js";
import { timeout } from "./genUtils.js";
import { features } from "tests/global.js";
import { Feature } from "@autumn/shared";

const PRECISION = 10;
const CREDIT_MULTIPLIER = 100000;

export const getCreditsUsed = (
  creditSystem: Feature,
  meteredFeatureId: string,
  value: number,
) => {
  let schemaItem = creditSystem.config.schema.find(
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

  let meteredPrice = product.prices[product.prices.length - 1];
  let overage = new Decimal(totalUsage)
    .minus(featureEntitlement.allowance)
    .toNumber();
  const overagePrice = getPriceForOverage(meteredPrice, overage);

  let basePrice = 0;
  if (includeBase && product.prices.length > 1) {
    basePrice = product.prices[0].config.amount;
  }

  let totalPrice = new Decimal(overagePrice.toFixed(2))
    .plus(basePrice)
    .toNumber();

  try {
    for (let i = 0; i < invoices.length; i++) {
      let invoice = invoices[i];
      if (invoice.total == totalPrice) {
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

export const sendGPUEvents = async ({
  customerId,
  eventCount,
  groupObj = {},
}: {
  customerId: string;
  eventCount: number;
  groupObj?: any;
}) => {
  let totalCreditsUsed = 0;
  const batchEvents = [];
  for (let i = 0; i < eventCount; i++) {
    let randomVal = new Decimal(Math.random().toFixed(PRECISION))
      .mul(CREDIT_MULTIPLIER)
      .toNumber();
    let gpuId = i % 2 == 0 ? features.gpu1.id : features.gpu2.id;

    let creditsUsed = getCreditsUsed(
      creditSystems.gpuCredits,
      gpuId,
      randomVal,
    );

    totalCreditsUsed = new Decimal(totalCreditsUsed)
      .plus(creditsUsed)
      .toNumber();

    batchEvents.push(
      AutumnCli.sendEvent({
        customerId: customerId,
        eventName: gpuId,
        properties: { value: randomVal, ...groupObj },
      }),
    );
  }

  await Promise.all(batchEvents);
  await timeout(10000);

  return { creditsUsed: totalCreditsUsed };
};
