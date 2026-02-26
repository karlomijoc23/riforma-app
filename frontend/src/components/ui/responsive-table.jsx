import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ResponsiveTable - wraps tables in a scrollable container on mobile
 * with proper accessibility attributes.
 */
const ResponsiveTable = React.forwardRef(
  ({ className, caption, children, ...props }, ref) => {
    return (
      <div
        className={cn(
          "w-full overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0",
          className,
        )}
        role="region"
        aria-label={caption || "Tablica podataka"}
        tabIndex={0}
      >
        <table ref={ref} className="w-full caption-bottom text-sm" {...props}>
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
    );
  },
);
ResponsiveTable.displayName = "ResponsiveTable";

/**
 * MobileCard - renders data as cards on mobile, hidden on desktop.
 * Use alongside a table that's hidden on mobile.
 */
const MobileCardList = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("space-y-3 md:hidden", className)}
        role="list"
        {...props}
      >
        {children}
      </div>
    );
  },
);
MobileCardList.displayName = "MobileCardList";

const MobileCard = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border bg-card p-4 shadow-sm",
          "active:bg-accent/50 transition-colors",
          className,
        )}
        role="listitem"
        {...props}
      >
        {children}
      </div>
    );
  },
);
MobileCard.displayName = "MobileCard";

/**
 * SkipLink - accessibility skip navigation link
 */
const SkipLink = ({
  href = "#main-content",
  children = "Preskoči na sadržaj",
}) => {
  return (
    <a
      href={href}
      className={cn(
        "sr-only focus:not-sr-only",
        "focus:fixed focus:top-2 focus:left-2 focus:z-[100]",
        "focus:bg-primary focus:text-primary-foreground",
        "focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg",
        "focus:outline-none focus:ring-2 focus:ring-ring",
      )}
    >
      {children}
    </a>
  );
};

export { ResponsiveTable, MobileCardList, MobileCard, SkipLink };
