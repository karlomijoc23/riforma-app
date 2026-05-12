import React from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

/**
 * Detail-page breadcrumb trail.
 *
 * Usage:
 *   <PageBreadcrumbs items={[
 *     { label: "Ugovori", to: "/ugovori" },
 *     { label: contract.interna_oznaka },
 *   ]} />
 *
 * The last item is rendered as the active page; all prior items must have `to`.
 */
const PageBreadcrumbs = ({ items = [] }) => {
  if (!items.length) return null;
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <React.Fragment key={`${item.label}-${idx}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="max-w-[200px] truncate sm:max-w-none">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default PageBreadcrumbs;
