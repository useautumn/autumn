import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { legacyAttach } from "@/internal/billing/v2/actions/legacy/legacyAttach";
import { renew } from "@/internal/billing/v2/actions/legacy/renew";
import { updateQuantity } from "@/internal/billing/v2/actions/legacy/updateQuantity";
import { migrate } from "@/internal/billing/v2/actions/migrate/migrate";
import { multiAttach } from "@/internal/billing/v2/actions/multiAttach/multiAttach";
import { setupPayment } from "@/internal/billing/v2/actions/setupPayment/setupPayment";
import { updateSubscription } from "@/internal/billing/v2/actions/updateSubscription/updateSubscription";

export const billingActions = {
	attach: attach,
	multiAttach: multiAttach,
	setupPayment: setupPayment,
	updateSubscription: updateSubscription,
	migrate: migrate,

	legacy: {
		attach: legacyAttach,
		updateQuantity: updateQuantity,
		renew: renew,
	},
} as const;
