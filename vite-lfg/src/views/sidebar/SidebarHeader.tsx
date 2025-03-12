import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarHeader, SidebarMenuButton } from "@/components/ui/sidebar";
// import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
// import { OrganizationSwitcher } from "@clerk/nextjs";

export const CustomSidebarHeader = async () => {
  return (
    <></>

    // <>
    //   {state == "expanded" ? (
    //     <SidebarHeader className="pr-2 pt-4 mb-2 w-full">
    //       <div className="flex items-center justify-between w-full">
    //         {/* <OrganizationSwitcher hidePersonal={true} /> */}

    //         <Button
    //           size="sm"
    //           onClick={toggleSidebar}
    //           variant="ghost"
    //           className="p-0 w-5 h-5"
    //         >
    //           <ChevronLeft className="text-t3" />
    //         </Button>
    //       </div>
    //     </SidebarHeader>
    //   ) : (
    //     <SidebarHeader className="">
    //       <SidebarMenuButton
    //         asChild
    //         onClick={toggleSidebar}
    //         className="p-0 m-0"
    //       >
    //         <ChevronRight className="text-t3" />
    //       </SidebarMenuButton>
    //     </SidebarHeader>
    //   )}
    // </>
  );
};
