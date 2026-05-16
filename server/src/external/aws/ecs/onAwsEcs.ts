/**
 * True iff this process is running inside an AWS ECS / Fargate task.
 * `ECS_CONTAINER_METADATA_URI_V4` is auto-injected by the ECS runtime
 * and unset everywhere else (local dev, trigger.dev workers, scripts),
 * so it's the canonical "am I on AWS?" gate — same one
 * `awsTaskIdentity` uses to discover the running service.
 */
export const onAwsEcs = (): boolean =>
	Boolean(process.env.ECS_CONTAINER_METADATA_URI_V4);
