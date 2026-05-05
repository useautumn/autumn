import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { createSchedule } from "@/internal/billing/v2/actions/createSchedule/createSchedule";
import { previewCreateSchedule } from "@/internal/billing/v2/actions/createSchedule/previewCreateSchedule";
import { legacyAttach } from "@/internal/billing/v2/actions/legacy/legacyAttach";
import { renew } from "@/internal/billing/v2/actions/legacy/renew";
import { updateQuantity } from "@/internal/billing/v2/actions/legacy/updateQuantity";
import { migrate } from "@/internal/billing/v2/actions/migrate/migrate";
import { multiAttach } from "@/internal/billing/v2/actions/multiAttach/multiAttach";
import { restore } from "@/internal/billing/v2/actions/restore/restore";
import { setupPayment } from "@/internal/billing/v2/actions/setupPayment/setupPayment";
import { sync } from "@/internal/billing/v2/actions/sync/sync";
import { syncProposals } from "@/internal/billing/v2/actions/sync/syncProposals";
import { syncProposalsV2 } from "@/internal/billing/v2/actions/sync/syncProposalsV2";
import { syncV2 } from "@/internal/billing/v2/actions/sync/syncV2";
import { updateSubscription } from "@/internal/billing/v2/actions/updateSubscription/updateSubscription";

export const billingActions = {
	attach: attach,
	createSchedule: createSchedule,
	previewCreateSchedule: previewCreateSchedule,
	multiAttach: multiAttach,
	setupPayment: setupPayment,
	updateSubscription: updateSubscription,
	migrate: migrate,
	restore: restore,
	sync: sync,
	syncV2: syncV2,
	syncProposals: syncProposals,
	syncProposalsV2: syncProposalsV2,

	legacy: {
		attach: legacyAttach,
		updateQuantity: updateQuantity,
		renew: renew,
	},
} as const;
