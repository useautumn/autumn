import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Plus, PlusIcon } from "lucide-react";
interface SideAccordionProps {
  title: string;
  value: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  buttonIcon?: React.ReactNode;
}

export function SideAccordion({
  title,
  value,
  children,
  className,
  onClick,
  buttonIcon,
}: SideAccordionProps) {
  return (
    <div className="w-full">
      <AccordionItem
        value={value}
        className="border border-transparent transition-all duration-100 ease-out origin-top"
      >
        <div className="w-full flex justify-between items-center">
          <div className="w-fit">
            <AccordionTrigger
              className={cn(
                "hover:bg-stone-100 border border-transparent text-t2 p-2",
                className
              )}
            >
              <span>{title}</span>
            </AccordionTrigger>
          </div>
          {onClick && (
            <Button variant="ghost" size="sm" onClick={onClick} className="">
              {buttonIcon}
            </Button>
          )}
        </div>
        <AccordionContent className="pb-0">
          <div className="flex flex-col gap-2 animate-in slide-in-from-top-1/2 duration-200 p-2 pr-0 w-full">
            {children}
          </div>
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}
