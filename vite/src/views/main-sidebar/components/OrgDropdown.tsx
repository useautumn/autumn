import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrg } from "@/hooks/useOrg";
import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { FrontendOrg } from "@autumn/shared";
import { DropdownMenuGroup } from "@radix-ui/react-dropdown-menu";
import { LogOut, Plus, Settings, Trash } from "lucide-react";
import React from "react";
import { useState } from "react";
import { CreateNewOrg } from "./CreateNewOrg";
import { toast } from "sonner";
import { LogOutItem } from "./LogOutItem";
import { cn } from "@/lib/utils";

const OrgLogo = ({ org }: { org: FrontendOrg }) => {
  const firstLetter = org.name.charAt(0).toUpperCase();
  return (
    <div className="bg-primary/80 w-5 h-5 rounded-md flex items-center justify-center">
      {org.logo ? (
        <img src={org.logo} alt={org.name} className="w-full h-full" />
      ) : (
        <span className="text-white text-xs">{firstLetter}</span>
      )}
    </div>
  );
};

export const OrgDropdown = () => {
  const { org, isLoading } = useOrg();
  const { data: orgs, isPending } = useListOrganizations();
  const [dialogType, setDialogType] = useState<"create" | "manage" | null>(
    null,
  );

  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!org) return null;
  if (isLoading) return <div></div>;

  return (
    <React.Fragment>
      <CreateNewOrg dialogType={dialogType} setDialogType={setDialogType} />

      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            className="p-2 h-7 gap-2 hover:bg-stone-200/60"
            variant="ghost"
          >
            <OrgLogo org={org} />
            <span className="text-t2">{org.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="border-1 border-zinc-200 shadow-sm w-48"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <div className="flex justify-between w-full items-center gap-2 text-t2">
                <span>Manage</span>
                <Settings size={14} />
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                setDialogType("create");
              }}
            >
              <div className="flex justify-between w-full items-center gap-2 text-t2">
                <span>Create New</span>
                <Plus size={14} />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-t2">
                Switch Organization
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-48">
                  {orgs?.map((org) => (
                    <SwitchOrgItem
                      key={org.id}
                      org={org}
                      setDropdownOpen={setDropdownOpen}
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <LogOutItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </React.Fragment>
  );
};

const SwitchOrgItem = ({ org, setDropdownOpen }: any) => {
  const [loading, setLoading] = useState(false);

  const { mutate } = useOrg();

  const handleSwitchOrg = async (orgId: string) => {
    setLoading(true);

    try {
      await authClient.organization.setActive({
        organizationId: orgId,
      });

      window.location.reload();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenuItem
      key={org.id}
      onClick={async (e) => {
        e.preventDefault();
        await handleSwitchOrg(org.id);
        setDropdownOpen(false);
      }}
      shimmer={loading}
      className="flex justify-between"
    >
      <span className={cn("text-t2")}>{org.name}</span>
    </DropdownMenuItem>
  );
};
