import React from "react";
import { Button } from "./button";
import { Plus } from "lucide-react";
import { cn } from "../../lib/utils";

const EmptyState = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-in fade-in-50",
        className,
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
        {Icon && <Icon className="h-10 w-10 text-muted-foreground/50" />}
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mb-4 mt-2 text-sm text-muted-foreground max-w-sm">
        {description}
      </p>
      {children}
      {actionLabel && onAction && (
        <Button onClick={onAction}>
          <Plus className="mr-2 h-4 w-4" /> {actionLabel}
        </Button>
      )}
    </div>
  );
};

export { EmptyState };
