"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";
import { NavButton } from "./NavButton";
import { useEnv } from "@/utils/envUtils";
import { MessageCircle } from "lucide-react";
import CopyButton from "@/components/general/CopyButton";
import { Link } from "react-router";

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
            icon={<MessageCircle size={14} />}
            title="Need help?"
            online={true}
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top">
        <span className="text-xs text-muted-foreground p-2">
          👋 We respond within 30 minutes
        </span>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => (window.location.href = `mailto:${email}`)}
          className="cursor-pointer"
        >
          <div className="flex items-center justify-between w-full">
            {/* <span>{email}</span> */}
            <span>hey@useautumn.com</span>
            <CopyButton
              text={email}
              className="bg-transparent shadow-none hover:bg-primary/5 w-6 gap-0 h-6 !px-0 py-0 flex items-center justify-center text-muted-foreground"
            />
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open("https://cal.com/ayrod", "_blank")}
          className="cursor-pointer"
        >
          Book a call
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer h-[30px] flex justify-start"
          asChild
        >
          <Link to="https://discord.gg/STqxY92zuS" target="_blank">
            We're online on Discord
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
            </span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
