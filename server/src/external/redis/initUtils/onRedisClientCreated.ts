import type { OnClientCreated } from "@autumn/cache";
import {
	instrumentRedis,
	type RedisClientType,
} from "../otel/instrumentRedis.js";
import { registerRedisCommands } from "./registerRedisCommands.js";

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

export const onRedisClientCreated: OnClientCreated = ({ redis, label }) => {
	const { region, redisType } = splitLabel({ label });
	instrumentRedis({ redis, region, redisType });
	registerRedisCommands({ redisInstance: redis });
};
