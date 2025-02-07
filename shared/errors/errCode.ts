export const ErrCode = {
  // General
  InvalidInputs: "invalid_inputs",
  LimitsReached: "limits_reached",
  // Org
  OrgNotFound: "org_not_found",

  // Feature
  FeatureNotFound: "feature_not_found",
  InvalidFeature: "invalid_feature",
  DuplicateFeatureId: "duplicate_feature_id",

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
  CustomerEntitlementNotFound: "customer_entitlement_not_found",

  // Product
  InvalidProduct: "invalid_product",
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

  // Entitlements
  InvalidEntitlement: "invalid_entitlement",
  CreateEntitlementFailed: "create_entitlement_failed",
  DeleteEntitlementFailed: "delete_entitlement_failed",

  // Invoice
  CreateInvoiceFailed: "create_invoice_failed",

  // Event
  InvalidEvent: "invalid_event",
  CreateEventFailed: "create_event_failed",
  DuplicateEvent: "duplicate_event",

  // Cus Product
  NoActiveCusProducts: "no_active_cus_products",
};
