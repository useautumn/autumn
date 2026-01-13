import "dotenv/config";
import { CusProductStatus } from "@autumn/shared";

export const BREAK_API_VERSION = 0.2;

export const getActiveCusProductStatuses = () => [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
];

export const ADMIN_USER_IDs = [
	"user_2tMgAiPsQzX8JTHjZZh9m0VdvUv", // a
	"user_2sB3tBXsnVVLlTKliQIqvvM2xfB", // j
	"ZsDswIXyOGMP9y1V1At4dAZNaiggClSs", // t
	"NqNuL3MtS7MR2WYoqx2b28iY9vmfAs8h", // c

	// Sandbox:
	"user_2rypooIKyMQx81vMS8FFGx24UHU", // john
];

export const dashboardOrigins = [
	"http://localhost:3000",
	"https://app.useautumn.com",
	"https://staging.useautumn.com",
	process.env.CLIENT_URL!,
];

export const WEBHOOK_EVENTS = [
	"checkout.session.completed",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"customer.discount.deleted",
	"invoice.paid",
	"invoice.upcoming",
	"invoice.created",
	"invoice.finalized",
	"invoice.updated",
	"subscription_schedule.canceled",
	"subscription_schedule.updated",
];
