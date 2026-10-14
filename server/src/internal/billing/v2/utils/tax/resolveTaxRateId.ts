import { ErrCode, RecaseError, type TaxParams } from "@autumn/shared";

export const resolveTaxRateId = ({
	tax,
	taxRateId,
}: {
	tax?: TaxParams;
	taxRateId?: string;
}) => {
	const rateId = tax?.rate_id ?? taxRateId;
	if (rateId && tax?.automatic_tax?.enabled === true) {
		throw new RecaseError({
			message:
				"tax.automatic_tax can't be enabled together with a tax rate. Pass either tax.automatic_tax or tax.rate_id (tax_rate_id), not both.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return rateId;
};
