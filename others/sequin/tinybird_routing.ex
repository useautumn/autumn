def route(action, record, changes, metadata) do
  datasource = case metadata.table_name do
    "customers"             -> "customers"
    "invoices"              -> "invoices"
    "organizations"         -> "organizations"
    "customer_products"     -> "customer_products"
    "customer_entitlements" -> "customer_entitlements"
    "customer_prices"       -> "customer_prices"
    "replaceables"          -> "replaceables"
    "rollovers"             -> "rollovers"
    "entitlements"          -> "entitlements"
    "free_trials"           -> "free_trials"
    "entities"              -> "entities"
    "subscriptions"         -> "subscriptions"
    "features"              -> "features"
    "prices"                -> "prices"
    "products"              -> "products"
  end

  %{
    method:        "POST",
    endpoint_path: "?name=#{datasource}&format=json"
  }
end
