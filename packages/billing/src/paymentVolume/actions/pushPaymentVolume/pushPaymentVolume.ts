import { getUsdRateTable, type UsdRateTable } from "@autumn/fx";
import type { PushResult } from "../../../actions/pushHourlyMeters/types/pushResult";
import type { MeteringContext } from "../../../types/meteringContext";
import { pushTrackItems } from "../../../utils/pushTrackItems";
import type { PaidInvoice } from "../../types/paidInvoice";
import { paidInvoiceToTrackItem } from "./paidInvoiceToTrackItem";

export type PaymentVolumeReport = PushResult & {
	invoices: number;
	skipped: number;
};

const utcDateOf = (epochMs: number): string =>
	new Date(epochMs).toISOString().slice(0, 10);

const collectedMoney = (invoice: PaidInvoice): boolean => invoice.amount > 0;

const rateTablesByDate = async ({
	ctx,
	invoices,
}: {
	ctx: MeteringContext;
	invoices: PaidInvoice[];
}): Promise<Map<string, UsdRateTable>> => {
	const dates = [
		...new Set(invoices.map((invoice) => utcDateOf(invoice.paidAtMs))),
	];
	const tables = await Promise.all(
		dates.map((date) => getUsdRateTable({ ctx, date })),
	);
	return new Map(dates.map((date, index) => [date, tables[index]]));
};

export const pushPaymentVolume = async ({
	ctx,
	invoices,
}: {
	ctx: MeteringContext;
	invoices: PaidInvoice[];
}): Promise<PaymentVolumeReport> => {
	const billable = invoices.filter(collectedMoney);
	const rateTables = await rateTablesByDate({ ctx, invoices: billable });

	const items = billable.map((invoice) => {
		const rateTable = rateTables.get(utcDateOf(invoice.paidAtMs));
		if (!rateTable)
			throw new Error(`No rate table loaded for invoice ${invoice.id}`);
		return paidInvoiceToTrackItem({ invoice, rateTable });
	});

	const result = await pushTrackItems({ ctx, items });
	return {
		invoices: invoices.length,
		skipped: invoices.length - billable.length,
		...result,
	};
};
