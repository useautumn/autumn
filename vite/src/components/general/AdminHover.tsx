import React, {
  useState,
  forwardRef,
  cloneElement,
  isValidElement,
} from "react";
import { Check } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

import { TooltipContent } from "../ui/tooltip";
import { Copy } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useAdmin } from "@/views/admin/hooks/useAdmin";

export const AdminHover = forwardRef<
  HTMLElement,
  {
    children: React.ReactNode;
    texts: (string | { key: string; value: string } | undefined | null)[];
    hide?: boolean;
  }
>(({ children, texts, hide = false }, ref) => {
  // const { data, isPending } = useSession();
  const { isAdmin } = useAdmin();

  // const user = data?.user;

  // // const { isLoaded, user } = useUser();
  // // const { actor } = useAuth();

  // const email = user?.email;

  // const isAdmin =
  //   // notNullish(actor) ||
  //   email === "johnyeocx@gmail.com" ||
  //   email === "ayush@recaseai.com" ||
  //   email === "johnyeo10@gmail.com" ||
  //   email == "npmrundemo@gmail.com";

  if (!isAdmin || hide) return <>{children}</>;

  // Try to forward the ref to the child if possible
  let triggerChild = children;
  if (isValidElement(children)) {
    triggerChild = cloneElement(children as React.ReactElement, { ref });
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="w-fit !cursor-default">
          {triggerChild}
        </TooltipTrigger>
        {isAdmin && (
          <TooltipContent
            className="bg-background/50 backdrop-blur-sm shadow-sm border-1 px-2 pr-6 py-2"
            align="start"
            side="bottom"
          >
            <div className="text-xs text-gray-500 flex flex-col gap-2">
              {texts.map((text: any) => {
                if (!text) return;
                if (typeof text === "object") {
                  return (
                    <div key={text.key}>
                      <p className="text-xs text-gray-500 font-medium">
                        {text.key}
                      </p>
                      <CopyText key={text.value} text={text.value} />
                    </div>
                  );
                } else {
                  return <CopyText key={text} text={text} />;
                }
              })}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
});

const CopyText = ({ text }: { text: string }) => {
  const [isHover, setIsHover] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <p
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
        className="flex flex-col items-start gap-1 font-mono hover:underline"
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
        {text && text.split("\n").map((line, i) => <span key={i}>{line}</span>)}
      </p>
      {isCopied || isHover ? (
        <div
          onClick={() => {
            navigator.clipboard.writeText(text);
            setIsCopied(true);
          }}
        >
          {isCopied ? <Check size={10} /> : <Copy size={10} />}
        </div>
      ) : (
        <Check size={10} className="text-transparent" />
      )}
    </div>
  );
};
