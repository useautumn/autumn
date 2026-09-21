import { CustomerExportKind, InternalError } from "@autumn/shared";

export const CUSTOMER_EXPORTS_PREFIX = "customer-exports";

export const CUSTOMER_EXPORT_FILE_NAME = "customers.csv";

export const CUSTOMER_EXPORT_DOWNLOAD_FILE_NAMES: Record<
	CustomerExportKind,
	string
> = {
	[CustomerExportKind.Customers]: CUSTOMER_EXPORT_FILE_NAME,
	[CustomerExportKind.BillingVerify]: "billing-issues.csv",
};

export type CustomerExportDestination = {
	bucket: string;
	region: string;
	key: string;
};

export const isCustomerExportsS3Configured = () =>
	Boolean(process.env.S3_CUSTOMER_EXPORTS_BUCKET);

export const getCustomerExportsS3Config = () => {
	const bucket = process.env.S3_CUSTOMER_EXPORTS_BUCKET;
	const region = process.env.S3_REGION;

	if (!bucket || !region) {
		throw new InternalError({
			message:
				"S3_CUSTOMER_EXPORTS_BUCKET and S3_REGION env variables are not set",
		});
	}

	return { bucket, region };
};

export const getCustomerExportKey = ({
	orgId,
	env,
	exportId,
}: {
	orgId: string;
	env: string;
	exportId: string;
}) =>
	`${CUSTOMER_EXPORTS_PREFIX}/${orgId}/${env}/${exportId}/${CUSTOMER_EXPORT_FILE_NAME}`;
