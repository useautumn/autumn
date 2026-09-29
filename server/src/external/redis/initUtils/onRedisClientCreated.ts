import type { OnClientCreated } from "@autumn/cache";
import {
	instrumentRedis,
	type RedisClientType,
} from "../otel/instrumentRedis.js";
import { registerRedisCommands } from "./registerRedisCommands.js";

/** Labels are `<region>:<redisType>`; the type is the segment after the last colon. */
const splitLabel = ({
	label,
}: {
	label: string;
}): { region: string; redisType: RedisClientType } => {
	const separator = label.lastIndexOf(":");
	return {
		region: label.slice(0, separator),
		redisType: label.slice(separator + 1) as RedisClientType,
	};
};

/** Tracing must patch the instance before the Lua commands are defined on it. */
export const onRedisClientCreated: OnClientCreated = ({ redis, label }) => {
	const { region, redisType } = splitLabel({ label });
	instrumentRedis({ redis, region, redisType });
	registerRedisCommands({ redisInstance: redis });
};
