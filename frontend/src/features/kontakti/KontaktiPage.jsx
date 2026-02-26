import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Truck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import ZakupniciPage from "../tenants/ZakupniciPage";
import VendorsPage from "../vendors/VendorsPage";

const KontaktiPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "dobavljaci" ? "dobavljaci" : "zakupnici";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value) => {
    setActiveTab(value);
    setSearchParams(value === "zakupnici" ? {} : { tab: value });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          Kontakti
        </h1>
        <p className="mt-1 text-muted-foreground">
          Upravljajte zakupnicima, partnerima i dobavljačima na jednom mjestu.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="zakupnici" className="gap-2">
            <Users className="h-4 w-4" />
            Zakupnici
          </TabsTrigger>
          <TabsTrigger value="dobavljaci" className="gap-2">
            <Truck className="h-4 w-4" />
            Dobavljači
          </TabsTrigger>
        </TabsList>

        <TabsContent value="zakupnici" className="mt-6">
          <ZakupniciPage embedded />
        </TabsContent>

        <TabsContent value="dobavljaci" className="mt-6">
          <VendorsPage embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default KontaktiPage;
