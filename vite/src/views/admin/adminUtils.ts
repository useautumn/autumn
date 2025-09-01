import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export const impersonateUser = async (userId: string) => {
	console.log("impersonating user", userId);
	try {
		await authClient.admin.stopImpersonating();
	} catch (error) {
		console.error(error);
	}
	const res = await authClient.admin.impersonateUser({
		userId,
	});

	if (res.error) {
		toast.error("Something went wrong");
		return;
	}

	window.location.reload();
};
