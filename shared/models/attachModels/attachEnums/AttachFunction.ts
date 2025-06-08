export enum AttachFunction {
  CreateCheckout = "create_checkout",
  AddProduct = "add_product",
  OneOff = "one_off",
  UpdateEnts = "update_ents", // only update entitlements
  ScheduleProduct = "schedule_product",
  UpdatePrepaidQuantity = "update_prepaid_quantity",
  Renew = "renew",
  // UpdateProduct = "update_product", // update product

  UpgradeSameInterval = "upgrade_same_interval",
  UpgradeDiffInterval = "upgrade_diff_interval",
}

/* Handle checkout / public error:
1. New version, same custom, same custom ents, renew, update prepaid quantity

2. 
*/
