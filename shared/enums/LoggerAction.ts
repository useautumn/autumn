export enum LoggerAction {
	AdjustAllowance = "adjust_allowance",

	StripeWebhook = "stripe_webhook",
	StripeWebhookInvoiceCreated = "stripe_webhook_invoice_created",

	InsertStripeInvoice = "insert_stripe_invoice",
	CreateFullCusProduct = "create_full_cus_product",
}
