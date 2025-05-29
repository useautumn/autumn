export enum AuthType {
  SecretKey = "secret_key",
  PublicKey = "public_key",
  Dashboard = "dashboard",
  Stripe = "stripe",
}

export enum ActionType {
  CustomerCreated = "customer.created",
  CustomerProductsUpdated = "customer.products.updated",
  CustomerFeaturesUpdated = "customer.features.updated",
}
