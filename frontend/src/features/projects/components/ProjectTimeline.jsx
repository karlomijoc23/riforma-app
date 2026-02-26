import React from "react";
import { Check, Clock, AlertCircle } from "lucide-react";
import { cn } from "../../../lib/utils";
import { formatDate } from "../../../shared/formatters";

const PhaseIcon = ({ status }) => {
  if (status === "completed") {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 ring-8 ring-white">
        <Check className="h-5 w-5 text-green-600" />
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 ring-8 ring-white">
        <Clock className="h-5 w-5 text-amber-600" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 ring-8 ring-white">
      <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
    </div>
  );
};

export default function ProjectTimeline({ phases = [] }) {
  // Sort phases by order
  const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

  if (sortedPhases.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Nema definiranih faza projekta.
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {sortedPhases.map((phase, phaseIdx) => (
          <li key={phase.id}>
            <div className="relative pb-8">
              {phaseIdx !== sortedPhases.length - 1 ? (
                <span
                  className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex space-x-3">
                <div>
                  <PhaseIcon status={phase.status} />
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {phase.name}
                    </p>
                    {phase.description && (
                      <p className="mt-1 text-sm text-gray-500">
                        {phase.description}
                      </p>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-right text-sm text-gray-500">
                    <div>
                      {phase.start_date ? formatDate(phase.start_date) : "N/A"}{" "}
                      - {phase.end_date ? formatDate(phase.end_date) : "N/A"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
