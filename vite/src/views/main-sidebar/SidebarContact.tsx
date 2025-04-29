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
          <div className="flex items-center justify-between w-full">
            {/* <span>{email}</span> */}
            <span>hey@useautumn.com</span>
            <CopyButton
              text={email}
              className="bg-transparent shadow-none hover:bg-zinc-200 w-6 gap-0 h-6 !px-0 py-0 flex items-center justify-center text-t2"
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
          className="cursor-pointer h-[30px] flex justify-between"
          asChild
        >
          <Link to="https://discord.gg/STqxY92zuS" target="_blank">
            Join our Discord
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
