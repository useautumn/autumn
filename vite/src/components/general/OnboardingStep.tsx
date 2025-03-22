import React from "react";
import { cn } from "@/lib/utils";
import { Wallet } from "lucide-react";

interface StepProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  description?: string;
}

function Step({ title, children, className, description }: StepProps) {
  return (
    <div
      className={cn(
        "relative pl-8 pb-8 border-l-2 border-zinc-200 gap-4 flex flex-col",
        className
      )}
    >
      <div className="absolute -left-[17px] -top-1 flex items-center justify-center w-8 h-8 rounded-full bg-stone-50">
        <Wallet size={16} className="text-t3" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-t1 text-lg font-medium">{title}</h1>
        {description && <p className="text-t3">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default Step;
