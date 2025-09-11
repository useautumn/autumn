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
import { useOrg } from "@/hooks/common/useOrg";
import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { DropdownMenuGroup } from "@radix-ui/react-dropdown-menu";
import { ChevronDown, PanelRight, Plus, Settings } from "lucide-react";

import { useState, useMemo } from "react";
import { CreateNewOrg } from "./CreateNewOrg";
import { toast } from "sonner";
import { LogOutItem } from "./LogOutItem";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ManageOrg } from "./ManageOrg";
import { useMemberships } from "../org-dropdown/hooks/useMemberships";
import { useSidebarContext } from "../SidebarContext";
import { OrgLogo } from "../org-dropdown/components/OrgLogo";
import { AdminHover } from "@/components/general/AdminHover";

import { AdminDropdownItems } from "./AdminDropdownItems";
import { useSearchParams } from "react-router";

export const OrgDropdown = () => {
  const { org, isLoading, error } = useOrg();
  const { expanded, setExpanded } = useSidebarContext();

  let { data: orgs, isPending } = useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();

  // Exclude the active organization from the orgs list (this makes it easier for users to understand which org is active)
  if (activeOrganization && orgs) {
    orgs = orgs.filter(
      (o) => o.id !== activeOrganization.id
    );
  }

  const [dialogType, setDialogType] = useState<"create" | "manage" | null>(
    null
  );

  const { data: session } = useSession();

  //remove the currect active org from the orgs data
  const inactiveOrgs = useMemo(() => {
    if (!orgs || !org) return [];
    return orgs.filter((orgItem: any) => orgItem.id !== org.id);
  }, [org, orgs]);

  // To pre-fetch data
  useMemberships();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  if (isLoading)
    return (
      <div className="h-7 w-32 px-4 flex items-center gap-2">
        <Skeleton className="min-w-5 h-5 bg-stone-200" />
        <Skeleton className="w-32 h-5 bg-stone-200" />
      </div>
    );

  if (!org || error) return null;

  return (
    <div className={cn("flex px-3")}>
      <ManageOrg open={manageOpen} setOpen={setManageOpen} />
      <CreateNewOrg dialogType={dialogType} setDialogType={setDialogType} />

      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <AdminHover
          texts={[
            {
              key: "id",
              value: org.id,
            },
          ]}
          asChild
        >
          <DropdownMenuTrigger asChild>
            <Button
              className={cn(
                "shimmer-hover p-0.5 gap-2 rounded-md hover:bg-stone-200/60 justify-start items-center transition-all duration-200",
                expanded ? "h-7 min-w-28" : "h-7 w-7 p-0.5"
              )}
              variant="ghost"
            >
              <OrgLogo org={org} />
              <div
                className={cn(
                  "flex items-center gap-1 transition-all duration-200",
                  expanded
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0"
                )}
              >
                <span className="text-t2 max-w-24 truncate">{org?.name}</span>
                <ChevronDown size={14} className="text-t3" />
              </div>
            </Button>
          </DropdownMenuTrigger>
        </AdminHover>
        <DropdownMenuContent
          align="start"
          className="border-1 border-zinc-200 shadow-sm w-48"
        >
          <AdminDropdownItems />
          <DropdownMenuItem className="flex justify-between w-full items-center gap-2 text-t2">
            <div className="flex flex-col">
              <span>{session?.user?.name}</span>
              <span className="text-xs text-zinc-500 break-all hyphens-auto">
                {session?.user?.email}
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setManageOpen(true);
                setDropdownOpen(false);
              }}
            >
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
            {!expanded && (
              <DropdownMenuItem
                onClick={(e) => {
                  setExpanded(true);
                  setDropdownOpen(false);
                }}
              >
                <div className="flex justify-between w-full items-center gap-2 text-t2">
                  <span>Open Sidebar</span>
                  <PanelRight size={14} />
                </div>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-t2">
                Switch Organization
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-48">
                  {inactiveOrgs?.map((org) => (
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
    </div>
  );
};

const SwitchOrgItem = ({ org, setDropdownOpen }: any) => {
  const [loading, setLoading] = useState(false);
  const [_, setSearchParams] = useSearchParams();

  const { mutate } = useOrg();

  const handleSwitchOrg = async (orgId: string) => {
    setLoading(true);

    try {
      setSearchParams(new URLSearchParams());

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
