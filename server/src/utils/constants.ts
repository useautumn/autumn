import { CusProductStatus } from "@autumn/shared";

export const BREAK_API_VERSION = 0.2;

export const getActiveCusProductStatuses = () => [
  CusProductStatus.Active,
  CusProductStatus.PastDue,
];
