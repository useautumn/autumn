export const ErrCode = {
  // General
  InvalidRequest: "invalid_request",
  InvalidId: "invalid_id",

  // Org
  CreateClerkOrgFailed: "create_clerk_org_failed",
  AssignUserToOrgFailed: "assign_user_to_org_failed",

  // Feature
  FeatureNotFound: "feature_not_found",
  InvalidFeature: "invalid_feature",
  DuplicateFeatureId: "duplicate_feature_id",
  UpdateFeatureFailed: "update_feature_failed",

  // Internal
  InternalError: "internal_error",
  DuplicateCustomerId: "duplicate_customer_id",
  StripeKeyNotFound: "stripe_key_not_found",

  // Stripe
  StripeKeyInvalid: "stripe_key_invalid",
  StripeConfigNotFound: "stripe_config_not_found",
  StripeDeleteCustomerFailed: "stripe_delete_customer_failed",
  StripeCreateCustomerFailed: "stripe_create_customer_failed",
  StripeCreateProductFailed: "stripe_create_product_failed",
  StripeCancelSubscriptionFailed: "stripe_cancel_subscription_failed",

  // Price
  PriceNotFound: "price_not_found",
  CreatePriceFailed: "create_price_failed",
  InvalidPrice: "invalid_price",
  InvalidPriceId: "invalid_price_id",
  InvalidPriceOptions: "invalid_price_options",
  InvalidPriceConfig: "invalid_price_config",

  // Customer
  InvalidCustomer: "invalid_customer",
  CreateCustomerFailed: "create_customer_failed",
  CustomerNotFound: "customer_not_found",
  CustomerAlreadyHasProduct: "customer_already_has_product",
  CustomerHasNoPaymentMethod: "customer_has_no_payment_method",
  CustomerHasNoBaseProduct: "customer_has_no_base_product",
  AttachProductToCustomerFailed: "attach_product_to_customer_failed",
  MultipleProductsFound: "multiple_products_found",
  MultipleCustomersFound: "multiple_customers_found",

  // Product
  InvalidProduct: "invalid_product",
  ProductAlreadyExists: "product_already_exists",
  ProductNotFound: "product_not_found",
  ProductHasCustomers: "product_has_customers",
  ProductHasNoPrices: "product_has_no_prices",
  ProductHasDifferentRecurringIntervals:
    "product_has_different_recurring_intervals",
  CreateStripeProductFailed: "create_stripe_product_failed",
  DeleteStripeProductFailed: "delete_stripe_product_failed",
  CreateStripeSubscriptionFailed: "create_stripe_subscription_failed",
  UpdateCusProductFailed: "update_customer_product_failed",
  DefaultProductNotAllowedPrice: "default_product_not_allowed_price",
  InvalidOptions: "invalid_options",

  // Entitlements
  InvalidEntitlement: "invalid_entitlement",
  CreateEntitlementFailed: "create_entitlement_failed",

  // Invoice
  CreateInvoiceFailed: "create_invoice_failed",
  PayInvoiceFailed: "pay_invoice_failed",

  // Payment errors
  CardDeclinedError: "card_declined_error",
};
