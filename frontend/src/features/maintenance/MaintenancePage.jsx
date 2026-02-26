import React from "react";
import MaintenanceBoard from "./MaintenanceBoard";

const MaintenancePage = () => {
  return (
    <div className="space-y-6 px-4 py-6 md:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-primary">
          Održavanje
        </h1>
        <p className="text-sm text-muted-foreground">
          Centralizirani pregled radnih naloga, timeline aktivnosti i popis svih
          zadataka.
        </p>
      </div>
      <MaintenanceBoard
        enableFilters
        enableList
        title={null}
        description={null}
      />
    </div>
  );
};

export default MaintenancePage;
