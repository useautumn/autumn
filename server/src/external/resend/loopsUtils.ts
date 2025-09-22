import { LoopsClient } from "loops";
import { logger } from "../logtail/logtailUtils.js";
import { User } from "better-auth";

const createLoopsCli = () => {
	return new LoopsClient(process.env.LOOPS_API_KEY || "");
};

export const createLoopsContact = async (user: User) => {
	if (!process.env.LOOPS_API_KEY) return;

	try {
		let email = user.email;
		let firstName = user.name?.split(" ")[0] || "";
		let lastName = user.name?.split(" ")[1] || "";
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

export { createLoopsCli };
