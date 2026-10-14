import "dotenv/config";
import { CusProductStatus } from "@autumn/shared";

const BREAK_API_VERSION = 0.2;

const getActiveCusProductStatuses = () => [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
];

export const ADMIN_USER_IDs = [
	"user_2tMgAiPsQzX8JTHjZZh9m0VdvUv",
	"user_2sB3tBXsnVVLlTKliQIqvvM2xfB",
	"ZsDswIXyOGMP9y1V1At4dAZNaiggClSs",
	"NqNuL3MtS7MR2WYoqx2b28iY9vmfAs8h",
	"y7xV3rybEkhoPfJe45dymZB1dXxvsolG",
	"NqNuL3MtS7MR2WYoqx2b28iY9vmfAs8h",
	"zviddNexn8HgLfo6jxxyK2KLcf8NrvtS",
	"user_2rypooIKyMQx81vMS8FFGx24UHU",
	"K7NDwSwohMCV9BXJ3Yb5MxgeXhWcwj0L",
];

export const dashboardOrigins = [
	"http://localhost:3000",
	"https://app.useautumn.com",
	"https://staging.useautumn.com",
	"https://dev.useautumn.com",
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
	"subscription_schedule.released",
	"subscription_schedule.updated",
	"test_helpers.test_clock.ready",
];
