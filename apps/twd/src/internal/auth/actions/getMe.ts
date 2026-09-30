import type { Me } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getUserById } from "../repos/usersRepo.ts";
import { requireActor } from "./requireActor.ts";

export const getMe = async ({ ctx }: { ctx: TwdContext }): Promise<Me> => {
	const actor = requireActor({ ctx });
	const user = await getUserById({ ctx, userId: actor.userId });
	return {
		userId: actor.userId,
		email: actor.email,
		name: user?.name ?? null,
		avatarUrl: user?.avatarUrl ?? null,
		via: actor.via,
	};
};
