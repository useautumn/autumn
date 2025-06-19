import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { OrgMembersList } from "../org-dropdown/manage-org/OrgMembersList";
import { OrgInvitesList } from "../org-dropdown/manage-org/OrgInvitesList";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { InvitePopover } from "../org-dropdown/manage-org/InvitePopover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrgDetails } from "./OrgDetails";

export const ManageOrg = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild></DialogTrigger>
      <DialogContent className="gap-0 p-0 rounded-sm w-[650px] h-[450px] flex flex-col justify-between bg-background text-foreground border-border">
        <div className="flex flex-col gap-6 overflow-hidden h-full">
          <DialogHeader className="px-6 pt-6 border-b border-border/10">
            <DialogTitle className="text-foreground">Manage Organization</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6 h-full overflow-hidden">
            <Tabs className="flex flex-col h-full" defaultValue="details">
              <PageSectionHeader
                titleComponent={
                  <TabsList className="p-0 flex gap-4 bg-transparent">
                    <TabsTrigger className="px-0 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground hover:text-foreground" value="details">
                      Details
                    </TabsTrigger>
                    <TabsTrigger className="px-0 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground hover:text-foreground" value="members">
                      Members
                    </TabsTrigger>
                    <TabsTrigger className="px-0 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground hover:text-foreground" value="invites">
                      Invites
                    </TabsTrigger>
                  </TabsList>
                }
                isOnboarding={true}
                className="px-6 border-b border-border/5"
                classNames={{
                  title: "text-foreground text-sm font-medium",
                }}
                addButton={<InvitePopover />}
              />

              <TabsContent value="details" className="h-full overflow-y-auto bg-background">
                <OrgDetails />
              </TabsContent>

              <TabsContent value="members" className="h-full overflow-y-auto bg-background">
                <OrgMembersList />
              </TabsContent>
              <TabsContent value="invites" className="h-full overflow-y-auto bg-background">
                <OrgInvitesList />
              </TabsContent>
            </Tabs>
          </div>
        </div>
        {/* <DialogFooter variant="new">
          <Button variant="add" onClick={handleCreate} isLoading={isLoading}>
            Create
          </Button>
        </DialogFooter> */}
      </DialogContent>
    </Dialog>
  );
};
