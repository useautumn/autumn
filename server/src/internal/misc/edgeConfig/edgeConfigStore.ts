import {
	createEdgeConfigStore as createStore,
	type EdgeConfigContext,
	EdgeConfigNotConfiguredError,
	type EdgeConfigStore as PackageEdgeConfigStore,
} from "@autumn/edge-config";
import { ErrCode } from "@autumn/shared";
import type { z } from "zod/v4";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import RecaseError from "@/utils/errorUtils.js";

export type { EdgeConfigStatus } from "@autumn/edge-config";

/** The server's binding of the shared store: its admin bucket, and a 503 when a write has nowhere to go. */
export const createEdgeConfigStore = <T>({
	s3Key,
	schema,
	defaultValue,
	retainOnError,
	pollIntervalMs,
	s3Client,
}: {
	s3Key: string;
	schema: z.ZodType<T>;
	defaultValue: () => T;
	retainOnError?: boolean;
	pollIntervalMs?: number;
	s3Client?: EdgeConfigContext["s3Client"];
}) => {
	const store = createStore<T>({
		ctx: { location: getAdminS3Config, s3Client },
		s3Key,
		schema,
		defaultValue,
		retainOnError,
		pollIntervalMs,
	});
	const writeToSource: PackageEdgeConfigStore<T>["writeToSource"] = async (
		params,
	) => {
		try {
			await store.writeToSource(params);
		} catch (error) {
			if (error instanceof EdgeConfigNotConfiguredError) {
				throw new RecaseError({
					message: error.message,
					code: ErrCode.InvalidRequest,
					statusCode: 503,
				});
			}
			throw error;
		}
	};
	return { ...store, writeToSource };
};

export type EdgeConfigStore<T = unknown> = ReturnType<
	typeof createEdgeConfigStore<T>
>;
