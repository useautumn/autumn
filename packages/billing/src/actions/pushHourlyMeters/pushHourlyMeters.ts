import { countApiCalls } from "../../apiRequests/actions/countApiCalls/countApiCalls";
import { pushApiCalls } from "../../apiRequests/actions/pushApiCalls/pushApiCalls";
import {
	type PaymentVolumeReport,
	pushPaymentVolume,
} from "../../paymentVolume/actions/pushPaymentVolume/pushPaymentVolume";
import { listPaidInvoices } from "../../paymentVolume/repos/listPaidInvoices";
import type { HourWindow } from "../../types/hourWindow";
import type { MeteringContext } from "../../types/meteringContext";
import { closedHourWindows } from "../../utils/closedHourWindows";
import { ensureOrgCustomers } from "./ensureOrgCustomers";
import type { OrgCustomer } from "./types/orgCustomer";
import type { PushResult } from "./types/pushResult";

/** Each run covers the hour that just closed; missed hours are the backfill's job. */
export const HOURS_PER_RUN = 1;

export type HourlyMetersReport = {
	windows: HourWindow[];
	orgs: number;
	apiCalls: PushResult & { counts: number };
	paymentVolume: PaymentVolumeReport;
};

/** The hourly cron: read every meter, make sure its orgs exist, then push. */
export const pushHourlyMeters = async ({
	ctx,
	nowMs,
	windows = closedHourWindows({ nowMs, count: HOURS_PER_RUN }),
}: {
	ctx: MeteringContext;
	nowMs: number;
	/** Override for backfills; defaults to the last closed hour. */
	windows?: HourWindow[];
}): Promise<HourlyMetersReport> => {
	const apiCallCounts = await countApiCalls({ ctx, windows });
	const paidInvoices = await listPaidInvoices({ ctx, windows });

	const orgs: OrgCustomer[] = [
		...apiCallCounts.map((count) => ({ id: count.orgId, name: count.orgSlug })),
		...paidInvoices.map((invoice) => ({
			id: invoice.orgId,
			name: invoice.orgSlug,
		})),
	];
	await ensureOrgCustomers({ ctx, orgs });

	const apiCalls = await pushApiCalls({ ctx, counts: apiCallCounts });
	const paymentVolume = await pushPaymentVolume({
		ctx,
		invoices: paidInvoices,
	});

	const report = {
		windows,
		orgs: new Set(orgs.map((org) => org.id)).size,
		apiCalls: { counts: apiCallCounts.length, ...apiCalls },
		paymentVolume,
	};
	ctx.logger.info("[metering] hourly run", { data: report });
	return report;
};
