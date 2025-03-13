"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComments, faCopy } from "@fortawesome/pro-duotone-svg-icons";
import { toast } from "sonner";
import { NavButton } from "./NavButton";
import { useEnv } from "@/utils/envUtils";

export function SidebarContact() {
  const email = "hey@useautumn.com";
  const env = useEnv();

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(email);
    toast.success("Email copied to clipboard");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div>
          <NavButton
            env={env}
            value="chat"
            icon={faComments}
            title="Chat with us"
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top">
        <span className="text-xs text-t3 p-2">
          👋 We respond within 30 minutes
        </span>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => (window.location.href = `mailto:${email}`)}
          className="cursor-pointer"
        >
          <span>{email}</span>
          <FontAwesomeIcon
            icon={faCopy}
            className="ml-2 cursor-pointer hover:text-primary"
            onClick={handleCopy}
          />
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open("https://cal.com/ayrod", "_blank")}
          className="cursor-pointer"
        >
          {/* <FontAwesomeIcon icon={faCalendar} className="mr-2" /> */}
          Book a call
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-progress h-[30px] flex justify-between">
          Discord <Badge>Soon</Badge>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
