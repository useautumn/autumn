import { getAdminS3Config } from "./adminS3Config.js";

const CUSTOMER_EXPORTS_PREFIX = "customer-exports";

export const CUSTOMER_EXPORT_FILE_NAME = "customers.csv";

export const getCustomerExportsS3Config = () => {
	const admin = getAdminS3Config();

	return {
		bucket: process.env.S3_CUSTOMER_EXPORTS_BUCKET || admin.bucket,
		region: process.env.S3_CUSTOMER_EXPORTS_REGION || admin.region,
	};
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
