import type { DbCustomerExport } from "@autumn/shared";
import { headS3Object } from "@/external/aws/s3/s3ObjectUtils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";

export type PublishedExportObject =
	| { status: "published"; byteCount: number | null }
	| { status: "absent" }
	| { status: "unknown" };

/** The upload and the completion write are not atomic, so a live object can outlive a dead run. */
export const findPublishedExportObject = async ({
	logger,
	customerExport,
	bucket,
	region,
}: {
	logger: Logger;
	customerExport: DbCustomerExport;
	bucket: string;
	region: string;
}): Promise<PublishedExportObject> => {
	if (!customerExport.s3_key) return { status: "absent" };

	try {
		const head = await headS3Object({
			bucket,
			region,
			key: customerExport.s3_key,
		});

		return head.exists
			? { status: "published", byteCount: head.contentLength }
			: { status: "absent" };
	} catch (error) {
		logger.warn("customer-export: could not check the export object", {
			data: {
				exportId: customerExport.id,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return { status: "unknown" };
	}
};
