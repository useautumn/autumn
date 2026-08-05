import {
	CustomerExportStatus,
	type DownloadCustomerExportResponse,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import {
	CUSTOMER_EXPORT_FILE_NAME,
	getCustomerExportsS3Config,
} from "@/external/aws/s3/customerExportsS3Config.js";
import { getS3PresignedGetUrl } from "@/external/aws/s3/s3PresignUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CustomerExportService } from "../CustomerExportService.js";

const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 300;

export const downloadCustomerExport = async ({
	ctx,
	exportId,
}: {
	ctx: AutumnContext;
	exportId: string;
}): Promise<DownloadCustomerExportResponse> => {
	const customerExport = await CustomerExportService.get({
		db: ctx.db,
		id: exportId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (!customerExport) {
		throw new RecaseError({
			message: `Customer export ${exportId} not found`,
			code: ErrCode.InvalidRequest,
			statusCode: 404,
		});
	}

	if (
		customerExport.status !== CustomerExportStatus.Completed ||
		!customerExport.s3_key
	) {
		throw new RecaseError({
			message: `Customer export ${exportId} is not ready to download (status: ${customerExport.status})`,
			code: ErrCode.InvalidRequest,
			statusCode: 409,
		});
	}

	const { bucket, region } = getCustomerExportsS3Config();
	const url = await getS3PresignedGetUrl({
		bucket,
		region,
		key: customerExport.s3_key,
		expiresIn: DOWNLOAD_URL_EXPIRES_IN_SECONDS,
		downloadFileName: CUSTOMER_EXPORT_FILE_NAME,
	});

	return {
		url,
		expires_in: DOWNLOAD_URL_EXPIRES_IN_SECONDS,
		file_name: CUSTOMER_EXPORT_FILE_NAME,
	};
};
