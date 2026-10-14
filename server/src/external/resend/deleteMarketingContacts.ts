import { deleteLoopsContact } from "./loopsUtils.js";
import { deleteResendContacts } from "./resendUtils.js";

export const deleteMarketingContacts = async ({ email }: { email: string }) => {
	await Promise.all([
		deleteLoopsContact({ email }),
		deleteResendContacts({ email }),
	]);
};
