import {
	createPostgresPools,
	type PostgresPools,
} from "./createPostgresPools.js";

let pools: PostgresPools | undefined;

export const getPostgresPools = (): PostgresPools => {
	pools ??= createPostgresPools({ runtimeEnv: process.env });
	return pools;
};
