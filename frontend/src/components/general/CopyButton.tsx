import React, { useEffect, useState } from "react";
import { Button, ButtonProps } from "../ui/button";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CopyButton({
  text,
  className,
  children,
  variant = "ghost",
}: {
  text: string;
  className?: string;
  children?: React.ReactNode;
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
      className={cn("h-6 w-6 p-0.5", className)}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      <p>{children}</p>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </Button>
  );
}

export default CopyButton;
