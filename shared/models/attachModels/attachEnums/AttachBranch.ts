export enum AttachBranch {
  // Done
  MultiProduct = "multi_product",
  OneOff = "one_off",
  New = "new",
  AddOn = "add_on",

  // Same product
  NewVersion = "new_version",
  SameCustomEnts = "same_custom_ents",
  SameCustom = "same_custom",

  // Done
  UpdatePrepaidQuantity = "update_prepaid_quantity",
  Renew = "renew",

  // Handle upgrades / downgrades
  MainIsTrial = "main_is_trial",
  MainIsFree = "main_is_free",
  Upgrade = "upgrade",
  Downgrade = "downgrade",
}
