import { ADMIN_REQUEST_BLOCK_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type RequestBlockConfig,
	RequestBlockConfigSchema,
	type RequestBlockEntry,
	type RequestBlockUpdate,
} from "./requestBlockSchemas.js";

const nowIso = () => new Date().toISOString();

const store = createEdgeConfigStore<RequestBlockConfig>({
	s3Key: ADMIN_REQUEST_BLOCK_CONFIG_KEY,
	schema: RequestBlockConfigSchema,
	defaultValue: () => ({ orgs: {} }),
});

registerEdgeConfig({ store });

export const getRuntimeRequestBlockStatus = () => store.getStatus();

export const getRuntimeRequestBlockEntry = (
	orgId: string,
): RequestBlockEntry | undefined => store.get().orgs[orgId];

export const getRequestBlockConfigFromSource = async () => {
	return await store.readFromSource();
};

export const getOrgRequestBlockFromSource = async ({
	orgId,
}: {
	orgId: string;
}) => {
	const config = await store.readFromSource();
	return config.orgs[orgId];
};

export const updateOrgRequestBlockInSource = async ({
	orgId,
	update,
	updatedBy,
}: {
	orgId: string;
	update: RequestBlockUpdate;
	updatedBy?: string;
}) => {
	const config = await store.readFromSource();
	const shouldDelete = !update.blockAll && update.blockedEndpoints.length === 0;

	if (shouldDelete) {
		delete config.orgs[orgId];
	} else {
		config.orgs[orgId] = {
			blockAll: update.blockAll,
			blockedEndpoints: update.blockedEndpoints,
			updatedAt: nowIso(),
			...(updatedBy && { updatedBy }),
		};
	}

	await store.writeToSource({ config });

	return config.orgs[orgId];
};

export const updateFullRequestBlockConfig = async ({
	config,
}: {
	config: RequestBlockConfig;
}) => {
	await store.writeToSource({ config });
};
