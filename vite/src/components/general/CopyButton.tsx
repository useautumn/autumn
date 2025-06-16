import React, { useEffect, useState } from "react";
import { Button, ButtonProps } from "../ui/button";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CopyButton({
  text,
  className,
  children,
  copySize,
  variant = "outline",
}: {
  text: string;
  className?: string;
  children?: React.ReactNode;
  copySize?: number;
  variant?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setCopied(false);
    }, 1000);
  }, [copied]);

  return (
    <Button
      variant={variant as ButtonProps["variant"]}
      size="icon"
      className={cn(
        "h-6 px-2 text-t2 w-fit font-mono rounded-md truncate justify-start",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {children && <span className="truncate block">{children}</span>}
      <div className="flex items-center justify-center">
        {copied ? (
          <Check size={copySize || 13} />
        ) : (
          <Copy size={copySize || 13} />
        )}
      </div>
    </Button>
  );
}

export default CopyButton;
