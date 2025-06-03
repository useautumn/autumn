// export enum AttachBranch {
//   MultiProduct = "multi_product",

//   OneOff = "one_off",

//   New = "new",
//   AddOn = "add_on",

//   // Same product
//   NewVersion = "new_version",
//   SameCustomEnts = "same_custom_ents",
//   SameCustom = "same_custom",
//   UpdatePrepaidQuantity = "update_prepaid_quantity",
//   Renew = "renew",

//   // Handle upgrades / downgrades
//   MainIsFree = "main_is_free",
//   MainIsTrial = "main_is_trial",
//   Upgrade = "upgrade",
//   Downgrade = "downgrade",
// }

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
