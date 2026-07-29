import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { attachLicense } from "@/internal/billing/v2/actions/attachLicense/attachLicense";
import { createSchedule } from "@/internal/billing/v2/actions/createSchedule/createSchedule";
import { previewCreateSchedule } from "@/internal/billing/v2/actions/createSchedule/previewCreateSchedule";
import { flash } from "@/internal/billing/v2/actions/dfu/flash";
import { legacyAttach } from "@/internal/billing/v2/actions/legacy/legacyAttach";
import { renew } from "@/internal/billing/v2/actions/legacy/renew";
import { updateQuantity } from "@/internal/billing/v2/actions/legacy/updateQuantity";
import { migrate } from "@/internal/billing/v2/actions/migrate/migrate";
import { multiAttach } from "@/internal/billing/v2/actions/multiAttach/multiAttach";
import { multiUpdate } from "@/internal/billing/v2/actions/multiUpdate/multiUpdate";
import { releaseLicense } from "@/internal/billing/v2/actions/releaseLicense/releaseLicense";
import { previewRestore } from "@/internal/billing/v2/actions/restore/previewRestore";
import { restore } from "@/internal/billing/v2/actions/restore/restore";
import { rollback } from "@/internal/billing/v2/actions/rollback/rollback";
import { setupPayment } from "@/internal/billing/v2/actions/setupPayment/setupPayment";
import { sync } from "@/internal/billing/v2/actions/sync/sync";
import { syncProposals } from "@/internal/billing/v2/actions/sync/syncProposals";
import { syncProposalsV2 } from "@/internal/billing/v2/actions/sync/syncProposalsV2";
import { syncV2 } from "@/internal/billing/v2/actions/sync/syncV2";
import { updateSubscription } from "@/internal/billing/v2/actions/updateSubscription/updateSubscription";
import { verify } from "@/internal/billing/v2/actions/verify/verify";

export const billingActions = {
	attach: attach,
	attachLicense: attachLicense,
	createSchedule: createSchedule,
	previewCreateSchedule: previewCreateSchedule,
	multiAttach: multiAttach,
	multiUpdate: multiUpdate,
	setupPayment: setupPayment,
	updateSubscription: updateSubscription,
	releaseLicense: releaseLicense,
	rollback: rollback,
	migrate: migrate,
	restore: restore,
	previewRestore: previewRestore,
	sync: sync,
	syncV2: syncV2,
	syncProposals: syncProposals,
	syncProposalsV2: syncProposalsV2,
	verify: verify,
	flash: flash,

	legacy: {
		attach: legacyAttach,
		updateQuantity: updateQuantity,
		renew: renew,
	},
} as const;
