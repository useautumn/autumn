import { z } from "zod/v4";
import { AppEnv } from "../../models/genModels/genEnums";
import {
	BYOC_CACHE_MACHINES,
	DEFAULT_BYOC_CACHE_MACHINE,
	findByocCacheMachine,
} from "../../models/orgModels/byocCacheMachines";
import { ByocCacheStatus } from "../../models/orgModels/byocConfig";

export const ByocCacheStatusSchema = z
	.enum([
		ByocCacheStatus.AwaitingSetup,
		ByocCacheStatus.Provisioning,
		ByocCacheStatus.Ready,
		ByocCacheStatus.Failed,
	])
	.describe(
		"`awaiting_setup` until the setup runs in your cloud, then `provisioning`, then `ready`.",
	);

export const ApiByocCacheSchema = z.object({
	env: z.enum(AppEnv).describe("The environment this Atom serves."),
	status: ByocCacheStatusSchema,
	deployment_id: z
		.string()
		.nullable()
		.describe("The deployment in your cloud, once setup has created it."),
	endpoint_url: z
		.string()
		.nullable()
		.describe("Where Atom answers, once it is running."),
	created_at: z.number().describe("When Atom was requested, ms since epoch."),
	cpu: z
		.number()
		.nullable()
		.describe("vCPUs of Atom's machine, once it is running."),
	memory: z
		.number()
		.nullable()
		.describe("Memory of Atom's machine in GiB, once it is running."),
});

const OFFERED_MACHINES = BYOC_CACHE_MACHINES.map(
	({ cpu, memory }) => `${cpu} vCPU / ${memory} GiB`,
).join(", ");

const isOfferedMachine = ({ cpu, memory }: { cpu: number; memory: number }) =>
	findByocCacheMachine({ cpu, memory }) !== undefined;

/** Both omitted takes the default machine; a lone `cpu` or `memory` names no machine. */
const isDefaultOrOfferedMachine = ({
	cpu,
	memory,
}: {
	cpu?: number;
	memory?: number;
}) => {
	const takesDefault = cpu === undefined && memory === undefined;
	if (takesDefault) return true;
	if (cpu === undefined || memory === undefined) return false;
	return isOfferedMachine({ cpu, memory });
};

const ByocCacheResourcesSchema = z.object({
	cpu: z.number().describe("vCPUs of Atom's machine."),
	memory: z.number().describe("Memory of Atom's machine in GiB."),
});

const offeredMachineError = {
	message: `cpu and memory must be one of: ${OFFERED_MACHINES}`,
};

export const CreateByocCacheParamsSchema = ByocCacheResourcesSchema.partial()
	.refine(isDefaultOrOfferedMachine, offeredMachineError)
	.describe(
		`The machine to start Atom on; defaults to ${DEFAULT_BYOC_CACHE_MACHINE.cpu} vCPU / ${DEFAULT_BYOC_CACHE_MACHINE.memory} GiB.`,
	);

export const ResizeByocCacheParamsSchema = ByocCacheResourcesSchema.refine(
	isOfferedMachine,
	offeredMachineError,
);

export const CreateByocCacheResponseSchema = ApiByocCacheSchema.extend({
	setup_url: z
		.string()
		.nullable()
		.describe(
			"Where to run the setup in your cloud. Minted per call, so call again for a fresh link.",
		),
	token: z
		.string()
		.describe("Sent as `x-atom-token` on every request to Atom."),
});

export const GetByocCacheParamsSchema = z.object({});

export const GetByocCacheResponseSchema = z.object({
	cache: ApiByocCacheSchema.nullable(),
});

export const DeleteByocCacheParamsSchema = z.object({});

export type ApiByocCache = z.infer<typeof ApiByocCacheSchema>;
export type CreateByocCacheResponse = z.infer<
	typeof CreateByocCacheResponseSchema
>;
export type GetByocCacheResponse = z.infer<typeof GetByocCacheResponseSchema>;
export type CreateByocCacheParams = z.infer<typeof CreateByocCacheParamsSchema>;
export type ResizeByocCacheParams = z.infer<typeof ResizeByocCacheParamsSchema>;
