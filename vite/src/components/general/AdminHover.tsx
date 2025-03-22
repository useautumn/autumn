import { Check } from "lucide-react";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { Tooltip, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

import { TooltipContent } from "../ui/tooltip";
import { Copy } from "lucide-react";
import { useState } from "react";

export const AdminHover = ({
  children,
  texts,
}: {
  children: React.ReactNode;
  texts: (string | undefined | null)[];
}) => {
  const { isLoaded, user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  let isAdmin =
    email === "johnyeocx@gmail.com" ||
    email === "ayush@recaseai.com" ||
    email === "johnyeo10@gmail.com";

  if (!isAdmin) return children;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>{children}</TooltipTrigger>
        {isLoaded && (
          <TooltipContent
            className="bg-white/50 backdrop-blur-sm shadow-sm border-1 min-w-[250px] w-fit py-2"
            align="start"
            side="bottom"
          >
            <div className="text-xs text-gray-500 flex flex-col gap-2">
              {texts.map((text) => {
                if (!text) return;
                return <CopyText key={text} text={text} />;
              })}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};

const CopyText = ({ text }: { text: string }) => {
  const [isHover, setIsHover] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <p
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
        className="flex items-center gap-1 font-mono hover:underline cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          navigator.clipboard.writeText(text);
          setIsCopied(true);
          setTimeout(() => {
            setIsCopied(false);
          }, 1000);
        }}
      >
        {text}
      </p>
      {(isCopied || isHover) && (
        <div
          onClick={() => {
            navigator.clipboard.writeText(text);
            setIsCopied(true);
          }}
        >
          {isCopied ? <Check size={10} /> : <Copy size={10} />}
        </div>
      )}
    </div>
  );
};
