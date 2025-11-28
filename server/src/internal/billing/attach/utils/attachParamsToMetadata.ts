import type { MetadataInsert, MetadataType } from "@autumn/shared";
import { addDays } from "date-fns";
import type { DrizzleCli } from "../../../../db/initDrizzle";
import { generateId } from "../../../../utils/genUtils";
import type { AttachParams } from "../../../customers/cusProducts/AttachParams";
import { MetadataService } from "../../../metadata/MetadataService";

export const attachParamsToMetadata = async ({
	db,
	attachParams,
	type,
	stripeInvoiceId,
	expiresAt,
}: {
	db: DrizzleCli;
	attachParams: AttachParams;
	type: MetadataType;
	stripeInvoiceId?: string;
	expiresAt?: number;
}) => {
	const {
		req: _req,
		checkoutSessionParams: _checkoutSessionParams,
		stripeCli: _stripeCli,
		paymentMethod: _paymentMethod,
		...rest
	} = attachParams;

	const attachClone = structuredClone(rest);

	const metadata: MetadataInsert = {
		id: generateId("meta"),
		created_at: Date.now(),
		expires_at: expiresAt ?? addDays(Date.now(), 10).getTime(),
		data: attachClone,
		type,
		stripe_invoice_id: stripeInvoiceId,
	};

	await MetadataService.insert({ db, data: metadata });

	return metadata;
};
