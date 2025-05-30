import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  AppEnv,
  Customer,
  Feature,
  FullProduct,
  Organization,
} from "@autumn/shared";
import Stripe from "stripe";

export type AttachFlags = {
  isMultiProduct: boolean;
  isCustom: boolean;
  hasPm: boolean;
  hasMainProduct: boolean;
  hasSameProduct: boolean;
  hasScheduledProduct: boolean;
};

export type AttachContext = {
  req: ExtendedRequest;
  customer: Customer;
  products: FullProduct[];
  paymentMethod: Stripe.PaymentMethod;
  stripeCli: Stripe;

  // More...?
};
