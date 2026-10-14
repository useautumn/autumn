import { convertToUsd, type UsdRateTable } from "@autumn/fx";
import type { TrackItem } from "../../../actions/pushHourlyMeters/types/trackItem";
import type { PaidInvoice } from "../../types/paidInvoice";

export const USD_VOLUME_FEATURE_ID = "usd_volume";

export const paidInvoiceIdempotencyKey = ({
	id,
}: Pick<PaidInvoice, "id">): string => `usd_volume:${id}`;

export const paidInvoiceToTrackItem = ({
	invoice,
	rateTable,
}: {
	invoice: PaidInvoice;
	rateTable: UsdRateTable;
}): TrackItem => {
	const conversion = convertToUsd({
		amount: invoice.amount,
		currency: invoice.currency,
		rateTable,
	});

	return {
		customerId: invoice.orgId,
		featureId: USD_VOLUME_FEATURE_ID,
		value: conversion.amountUsd,
		timestampMs: invoice.paidAtMs,
		idempotencyKey: paidInvoiceIdempotencyKey(invoice),
		properties: {
			invoice_id: invoice.id,
			stripe_id: invoice.stripeId,
			...(invoice.processorType
				? { processor_type: invoice.processorType }
				: {}),
			currency: invoice.currency,
			amount: invoice.amount,
			rate_code: conversion.rateCode,
			rate: conversion.rate,
			rate_date: conversion.rateDate,
			source: conversion.source,
		},
	};
};
