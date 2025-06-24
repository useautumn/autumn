import { cn } from "@/lib/utils";
import { FrontendOrg } from "@autumn/shared";
import { useSidebarContext } from "../../SidebarContext";

export const OrgLogo = ({ org }: { org: FrontendOrg }) => {
  const { state } = useSidebarContext();
  const firstLetter = org.name.charAt(0).toUpperCase();
  const expanded = state === "expanded";
  return (
    <div
      className={cn(
        "rounded-md overflow-hidden flex items-center justify-center scale-100 translate-x-[1px] bg-zinc-200",
        expanded ? "w-5 h-5" : "min-w-5 min-h-5",
      )}
    >
      {org.logo ? (
        <img src={org.logo} alt={org.name} className="w-full h-full" />
      ) : (
        <span className="w-5 h-5 flex items-center justify-center bg-gradient-to-r from-purple-600 via-purple-500 to-[#6f47ff] text-white text-xs">
          {firstLetter}
        </span>
      )}
    </div>
  );
};
