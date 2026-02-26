import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";

jest.mock("axios", () => require("../testUtils/axiosMock").default, {
  virtual: true,
});

const {
  default: axiosMock,
  resetAxiosMock,
} = require("../testUtils/axiosMock");

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    return {
      BrowserRouter: ({ children }) => <div>{children}</div>,
      Routes: ({ children }) => <>{children}</>,
      Route: ({ element }) => element,
      Link: ({ children }) => <a href="#">{children}</a>,
      useNavigate: () => jest.fn(),
      useLocation: () => ({ pathname: "/" }),
      useParams: () => ({}),
    };
  },
  { virtual: true },
);

jest.mock(
  "@/lib/utils",
  () => ({
    cn: (...classes) => classes.filter(Boolean).join(" "),
    dedupeRemindersById: (reminders) => reminders,
  }),
  { virtual: true },
);

jest.mock("sonner", () => {
  const toast = Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  });
  return { toast };
});

import Dashboard from "../features/dashboard/DashboardPage";
import { EntityStoreContext } from "../shared/entityStore";

const dashboardResponse = {
  ukupno_nekretnina: 5,
  aktivni_ugovori: 3,
  ugovori_na_isteku: 1,
  aktivni_podsjetnici: 2,
  mjesecni_prihod: 12000,
  ukupna_vrijednost_portfelja: 2200000,
  portfolio_breakdown: [
    {
      property_id: "1",
      property_name: "Tower A",
      total_value: 1600000,
      type: "office",
      count: 1,
    },
    {
      property_id: "2",
      property_name: "Tower B",
      total_value: 600000,
      type: "retail",
      count: 1,
    },
  ],
  series: {
    monthly_revenue: [
      { month: "2024-08", value: 11000 },
      { month: "2024-09", value: 12000 },
    ],
    monthly_expense: [{ month: "2024-09", value: 4000 }],
  },
  odrzavanje_novo: 2,
  odrzavanje_ceka_dobavljaca: 1,
  odrzavanje_u_tijeku: 1,
  odrzavanje_zavrseno: 5,
  najamni_kapacitet: {
    ukupna_povrsina: 1200,
    zauzeta_povrsina: 950,
    zauzetost_postotak: 79.1,
    prosjecna_zakupnina_m2: 15.5,
  },
};

const remindersResponse = [
  {
    id: "rem-1",
    ugovor_id: "contract-1",
    tip: "istek_ugovora",
    datum_podsjetnika: "2024-12-01",
  },
];

beforeEach(() => {
  resetAxiosMock();
  entityStoreValue.changeTenant.mockClear();
  axiosMock.get.mockImplementation((url) => {
    if (url.endsWith("/dashboard")) {
      return Promise.resolve({ data: dashboardResponse });
    }
    if (url.endsWith("/podsjetnici/aktivni")) {
      return Promise.resolve({ data: remindersResponse });
    }
    if (url.endsWith("/podsjetnici")) {
      return Promise.resolve({ data: remindersResponse });
    }
    if (url.endsWith("/tenants")) {
      return Promise.resolve({
        data: [
          { id: "tenant-default", naziv: "Primarni portfelj", role: "owner" },
          { id: "tenant-2", naziv: "Drugi portfelj", role: "member" },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  });
});

const entityStoreValue = {
  nekretnine: [{ id: "prop-1", naziv: "Tower A" }],
  zakupnici: [{ id: "tenant-1", naziv_firme: "Energo d.o.o." }],
  ugovori: [
    {
      id: "contract-1",
      nekretnina_id: "prop-1",
      zakupnik_id: "tenant-1",
      datum_zavrsetka: "2025-02-01",
      status: "aktivno",
    },
  ],
  dokumenti: [],
  propertyUnits: [],
  propertyUnitsById: {},
  propertyUnitsByProperty: {},
  maintenanceTasks: [],
  loading: false,
  error: null,
  refresh: jest.fn(),
  refreshMaintenanceTasks: jest.fn(),
  refreshRacuni: jest.fn(),
  tenantId: "tenant-default",
  changeTenant: jest.fn(),
  ensureNekretnine: jest.fn(),
  ensureZakupnici: jest.fn(),
  ensureUgovori: jest.fn(),
  ensureDokumenti: jest.fn(),
  ensureMaintenanceTasks: jest.fn(),
  ensureRacuni: jest.fn(),
};

function renderDashboard() {
  return render(
    <EntityStoreContext.Provider value={entityStoreValue}>
      <Dashboard />
    </EntityStoreContext.Provider>,
  );
}

it("renders summary cards with dashboard metrics", async () => {
  renderDashboard();

  await waitFor(() =>
    expect(screen.getByTestId("ukupno-nekretnina-card")).toBeInTheDocument(),
  );

  const propertiesCard = screen.getByTestId("ukupno-nekretnina-card");
  expect(within(propertiesCard).getByText("5")).toBeInTheDocument();

  const contractsCard = screen.getByTestId("aktivni-ugovori-card");
  expect(within(contractsCard).getByText("3")).toBeInTheDocument();

  // formatCompactCurrency(12000) => "12.0k €"
  const revenueCard = screen.getByTestId("mjesecni-prihod-card");
  expect(within(revenueCard).getByText(/12\.0k\s*€/)).toBeInTheDocument();
});

it("shows maintenance section after data load", async () => {
  renderDashboard();

  await waitFor(() =>
    expect(screen.getByText("Kontrolni centar")).toBeInTheDocument(),
  );

  // Maintenance section exists with title "Održavanje"
  expect(screen.getAllByText("Održavanje").length).toBeGreaterThanOrEqual(1);

  // The KPI card shows maintenanceTotal (2+1+1=4) + "otvoreno"
  expect(screen.getByText("otvoreno")).toBeInTheDocument();

  // Maintenance breakdown tiles
  expect(screen.getByText("Novi zahtjevi")).toBeInTheDocument();
});
