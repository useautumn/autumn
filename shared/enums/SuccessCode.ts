export enum SuccessCode {
	// Track
	SuccessfullyDeducted = "successfully_deducted",
	EventReceived = "event_received",
	EventReceivedCustomerCreated = "event_received_customer_created",

	// Entitlements
	FeatureFound = "feature_found",
	FeatureFoundCustomerCreated = "feature_found_customer_created",

	// Attach
	FeaturesUpdated = "features_updated",
	UpgradedToNewProduct = "upgraded_to_new_product",
	UpgradedToNewVersion = "upgraded_to_new_version",
	UpdatedSameProduct = "updated_same_product",
	PrepaidQuantityUpdated = "prepaid_quantity_updated",
	DowngradeScheduled = "downgrade_scheduled",

	FreeProductAttached = "free_product_attached",
	CheckoutCreated = "checkout_created",
	NewProductAttached = "new_product_attached",
	OneOffProductAttached = "one_off_product_attached",
	ProductFound = "product_found",

	RenewedProduct = "renewed_product",
}
