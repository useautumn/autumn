import { LogOut } from "lucide-react";
import React from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

export const LogOutItem = () => {
	return (
		<React.Fragment>
			<DropdownMenuItem
				onClick={async () => {
					try {
						await authClient.signOut();
					} catch (error) {
						console.error("Error signing out:", error);
					} finally {
						window.location.href = "/sign-in";
					}
				}}
			>
				<div className="flex justify-between w-full items-center gap-2 text-t2">
					<span>Log Out</span>
					<LogOut size={14} />
				</div>
			</DropdownMenuItem>
			{/* <DropdownMenuItem
        onClick={async () => {
          await authClient.deleteUser({
            callbackURL: "http://localhost:3000/sign-in",
          });
        }}
      >
        <div className="flex justify-between w-full items-center gap-2 text-t2">
          <span>Delete Account</span>
          <Trash size={14} />
        </div>
      </DropdownMenuItem> */}
		</React.Fragment>
	);
};
