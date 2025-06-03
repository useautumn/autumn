export enum AttachFunction {
  CreateCheckout = "create_checkout",
  AddProduct = "add_product",
  UpdateEnts = "update_ents", // only update entitlements
  UpdateProduct = "update_product", // update product
  ScheduleProduct = "schedule_product",
  UpdatePrepaidQuantity = "update_prepaid_quantity",
  Renew = "renew",
}

/* Handle checkout / public error:
1. New version, same custom, same custom ents, renew, update prepaid quantity

2. 
*/
