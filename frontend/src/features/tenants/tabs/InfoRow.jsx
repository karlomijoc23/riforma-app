import React from "react";

/** Reusable label/value row used inside all ZakupnikDetail tabs. */
const InfoRow = ({ icon: Icon, label, value, className = "" }) => {
  if (!value) return null;
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />}
      <div className="grid gap-0.5 w-full min-w-0">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-sm text-foreground break-all">{value}</span>
      </div>
    </div>
  );
};

export default InfoRow;
