import type { User } from "better-auth";
import { LoopsClient } from "loops";
import { logger } from "../logtail/logtailUtils.js";

const createLoopsCli = () => {
	return new LoopsClient(process.env.LOOPS_API_KEY || "");
};

export const createLoopsContact = async (user: User) => {
	if (!process.env.LOOPS_API_KEY) return;

	try {
		const email = user.email;
		const firstName = user.name?.split(" ")[0] || "";
		const lastName = user.name?.split(" ")[1] || "";
		const loops = createLoopsCli();

		const resp = await loops.createContact(email, {
			firstName,
			lastName,
		});

		return resp;
	} catch (error) {
		logger.error("Error creating loops contact", { error });
	}
};
