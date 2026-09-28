import { deleteLoopsContact } from "./loopsUtils.js";
import { deleteResendContacts } from "./resendUtils.js";

/** Removes a user from every marketing/email list we sync them to. Never throws. */
export const deleteMarketingContacts = async ({ email }: { email: string }) => {
	await Promise.all([
		deleteLoopsContact({ email }),
		deleteResendContacts({ email }),
	]);
};
