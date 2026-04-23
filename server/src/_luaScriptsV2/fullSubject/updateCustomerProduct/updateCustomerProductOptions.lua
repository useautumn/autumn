local function update_customer_product_options(params)
  local customer_product = params.customer_product
  local options = params.options

  customer_product.options = options
end
