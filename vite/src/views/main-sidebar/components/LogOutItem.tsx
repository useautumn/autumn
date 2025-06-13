import { authClient } from "@/lib/auth-client";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LogOut, Trash } from "lucide-react";
import { useState } from "react";
import React from "react";

export const LogOutItem = () => {
  const [loading, setLoading] = useState(false);

  return (
    <React.Fragment>
      <DropdownMenuItem
        onClick={async () => {
          try {
            setLoading(true);
            await authClient.signOut();
            window.location.reload();
          } catch (error) {
            console.error("Error signing out:", error);
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="flex justify-between w-full items-center gap-2 text-t2">
          <span>Log Out</span>
          <LogOut size={14} />
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem
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
      </DropdownMenuItem>
    </React.Fragment>
  );
};
