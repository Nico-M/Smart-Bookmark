import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

function Accordion({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="accordion" className={cn("w-full", className)} {...props} />;
}

function AccordionItem({ className, ...props }: React.ComponentProps<"details">) {
  return (
    <details
      data-slot="accordion-item"
      className={cn(
        "group rounded-base overflow-hidden border-2 border-b border-border shadow-shadow",
        className
      )}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"summary">) {
  return (
    <summary
      data-slot="accordion-trigger"
      className={cn(
        "flex list-none items-center justify-between gap-2 text-left text-base text-main-foreground border-border bg-main p-4 font-heading transition-all focus-visible:ring-[3px] group-open:rounded-b-none group-open:border-b-2 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="pointer-events-none size-5 shrink-0 transition-transform duration-200 group-open:rotate-180" />
    </summary>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="accordion-content"
      className="overflow-hidden rounded-b-base bg-secondary-background text-sm font-base"
      {...props}
    >
      <div className={cn("p-4", className)}>{children}</div>
    </div>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
