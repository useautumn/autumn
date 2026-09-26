import { DropdownMenuItem } from "@autumn/ui";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
	ORG_MENU_ICON_CLASS,
	ORG_MENU_ICON_STROKE,
	ORG_MENU_ITEM_CLASS,
} from "./orgMenuClass";

const signOut = async () => {
	try {
		await authClient.signOut();
	} catch (error) {
		console.error("Error signing out:", error);
	} finally {
		window.location.href = "/sign-in";
	}
};

export const LogOutItem = () => (
	<DropdownMenuItem className={ORG_MENU_ITEM_CLASS} onClick={signOut}>
		<LogOut
			className={ORG_MENU_ICON_CLASS}
			strokeWidth={ORG_MENU_ICON_STROKE}
		/>
		Log out
	</DropdownMenuItem>
);
