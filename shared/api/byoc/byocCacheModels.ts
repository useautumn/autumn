import { z } from "zod/v4";
import { AppEnv } from "../../models/genModels/genEnums";
import {
	BYOC_CACHE_MACHINES,
	DEFAULT_BYOC_CACHE_MACHINE,
	findByocCacheMachine,
} from "../../models/orgModels/byocCacheMachines";
import { BYOC_CACHE_AWS_REGIONS } from "../../models/orgModels/byocCacheRegions";
import {
	ByocCacheStage,
	ByocCacheStageStatus,
	ByocCacheStatus,
} from "../../models/orgModels/byocConfig";

export const ByocCacheStatusSchema = z
	.enum(ByocCacheStatus)
	.describe(
		"`awaiting_setup` until the setup runs in your cloud, then `provisioning`, then `ready`. A delete moves it to `removing`, then `teardown_required` until you delete the stack.",
	);

export const ByocCacheStagesSchema = z
	.record(z.enum(ByocCacheStage), z.enum(ByocCacheStageStatus))
	.describe(
		"Each deploy step, in order: stack, disk, machine, load_balancer, atom, then connected once Autumn reaches Atom.",
	);

export const ByocCacheNetworkSchema = z
	.discriminatedUnion("type", [
		z.object({
			type: z.literal("existing_vpc"),
			vpc_id: z.string().min(1),
			subnet_ids: z.array(z.string().min(1)).min(1),
		}),
		z.object({ type: z.literal("new_vpc") }),
	])
	.describe(
		"An existing VPC keeps Atom private to it; a new VPC serves it over the internet with its token.",
	);

const ByocCacheRegionSchema = z.enum(BYOC_CACHE_AWS_REGIONS);

/** The part of a stack name the org picks; Autumn adds `-<6 hex chars>`, and the whole fits alien's 100. */
export const ByocStackNameSchema = z
	.string()
	.trim()
	.max(93, "Keep it under 93 characters")
	.regex(
		/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
		"Use lowercase letters, digits and single hyphens, starting with a letter",
	)
	.refine((name) => !name.startsWith("dg-"), "Can't start with dg-");

export const ApiByocCacheSchema = z.object({
	id: z.string().describe("This Atom; a replacement is a new one."),
	env: z.enum(AppEnv).describe("The environment this Atom serves."),
	stack_name: z.string().describe("The stack's name in your cloud."),
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
	first_check_at: z
		.number()
		.nullable()
		.describe(
			"When Atom first answered a check from your app; setup is done from then on.",
		),
	cpu: z
		.number()
		.nullable()
		.describe("vCPUs of Atom's machine, once it is running."),
	memory: z
		.number()
		.nullable()
		.describe("Memory of Atom's machine in GiB, once it is running."),
	region: z
		.string()
		.nullable()
		.describe("The cloud region Atom runs in, or the one its setup asked for."),
	network: ByocCacheNetworkSchema.nullable(),
	stages: ByocCacheStagesSchema,
	error: z
		.string()
		.nullable()
		.describe("Why the deploy or teardown stopped, once it has."),
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
	.extend({
		region: ByocCacheRegionSchema.optional().describe(
			"The AWS region to set Atom up in.",
		),
		network: ByocCacheNetworkSchema.optional(),
		stack_name: ByocStackNameSchema.optional().describe(
			"Names the stack in your cloud; Autumn adds a short suffix unique to this env. Defaults to `atom-<org>-<env>`.",
		),
	})
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
			"The AWS CloudFormation console page that creates Atom's stack in your account, prefilled with your region and network. Minted per call, so call again for a fresh link.",
		),
	token: z
		.string()
		.describe("Sent as `x-atom-token` on Autumn's pushes to Atom."),
});

export const GetByocCacheParamsSchema = z.object({});

export const GetByocCacheResponseSchema = z.object({
	cache: ApiByocCacheSchema.nullable(),
	removing: z
		.array(ApiByocCacheSchema)
		.describe(
			"Earlier Atoms still being removed, or waiting on you to delete their stack.",
		),
	stack_name: z
		.string()
		.describe(
			"The name Autumn gives the stack in your cloud: the env's Atom's, or the next one's.",
		),
	stack_name_suffix: z
		.string()
		.describe("What Autumn adds after `-` to the name you pick."),
});

export const DeleteByocCacheParamsSchema = z.object({
	atom_id: z
		.string()
		.optional()
		.describe(
			"An Atom whose removal stopped, to retry it. Defaults to the env's Atom.",
		),
});

export const RetryByocCacheParamsSchema = z.object({});

export type ApiByocCache = z.infer<typeof ApiByocCacheSchema>;
export type CreateByocCacheResponse = z.infer<
	typeof CreateByocCacheResponseSchema
>;
export type GetByocCacheResponse = z.infer<typeof GetByocCacheResponseSchema>;
export type CreateByocCacheParams = z.infer<typeof CreateByocCacheParamsSchema>;
export type ResizeByocCacheParams = z.infer<typeof ResizeByocCacheParamsSchema>;
