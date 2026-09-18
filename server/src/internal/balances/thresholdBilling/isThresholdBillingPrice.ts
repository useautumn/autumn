import type { Price } from "@autumn/shared";
import { priceThresholdBilling } from "./priceThresholdBilling.js";

export const isThresholdBillingPrice = ({ price }: { price: Price }): boolean =>
	priceThresholdBilling({ price }) !== undefined;
