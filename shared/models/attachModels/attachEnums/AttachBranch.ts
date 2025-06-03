export enum AttachBranch {
  MultiProduct = "multi_product",

  OneOff = "one_off",

  New = "new",
  AddOn = "add_on",

  // Same product
  NewVersion = "new_version",
  SameCustomEnts = "same_custom_ents",
  SameCustom = "same_custom",
  UpdatePrepaidQuantity = "update_prepaid_quantity",
  Renew = "renew",

  // Handle upgrades / downgrades
  MainIsFree = "main_is_free",
  MainIsTrial = "main_is_trial",
  Upgrade = "upgrade",
  Downgrade = "downgrade",
}
