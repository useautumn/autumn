import "dotenv/config";
import { CusProductStatus } from "@autumn/shared";

export const BREAK_API_VERSION = 0.2;

export const getActiveCusProductStatuses = () => [
  CusProductStatus.Active,
  CusProductStatus.PastDue,
];

export const ADMIN_USER_IDs =
  process.env.ENV == "production" || process.env.NODE_ENV == "production"
    ? ["user_2tMgAiPsQzX8JTHjZZh9m0VdvUv", "user_2sB3tBXsnVVLlTKliQIqvvM2xfB"]
    : ["user_2rypooIKyMQx81vMS8FFGx24UHU"];

export const dashboardOrigins = [
  "http://localhost:3000",
  "https://app.useautumn.com",
];
