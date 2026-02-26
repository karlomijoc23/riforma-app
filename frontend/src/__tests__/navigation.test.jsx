import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock react-router-dom
const mockNavigate = jest.fn();
const mockLocation = { pathname: "/" };

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    return {
      BrowserRouter: ({ children }) => <div>{children}</div>,
      Link: React.forwardRef(({ children, to, ...rest }, ref) => (
        <a href={to} ref={ref} {...rest}>
          {children}
        </a>
      )),
      useNavigate: () => mockNavigate,
      useLocation: () => mockLocation,
    };
  },
  { virtual: true },
);

// Mock auth
const mockLogout = jest.fn();
jest.mock("../shared/auth", () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

// Mock api
jest.mock("../shared/api", () => ({
  api: {
    globalSearch: jest.fn().mockResolvedValue({ data: {} }),
    getTenants: jest.fn().mockResolvedValue({ data: [] }),
  },
  getActiveTenantId: () => "tenant-default",
  setActiveTenantId: jest.fn(),
  subscribeToTenantChanges: () => () => {},
}));

// Mock TenantSwitcher so we don't pull in its own deep deps
jest.mock("../components/TenantSwitcher", () => ({
  TenantSwitcher: ({ onLogout }) => (
    <button onClick={onLogout} data-testid="tenant-switcher">
      TenantSwitcher
    </button>
  ),
}));

// Mock NotificationBell so we don't pull in its deep deps
jest.mock("../components/NotificationBell", () => ({
  NotificationBell: () => <span data-testid="notification-bell">Bell</span>,
}));

// Mock lucide-react icons to simple spans
jest.mock("lucide-react", () => {
  const React = require("react");
  const icon = (name) =>
    React.forwardRef((props, ref) => (
      <span ref={ref} data-icon={name} {...props} />
    ));
  return {
    Home: icon("Home"),
    Building: icon("Building"),
    Users: icon("Users"),
    Calendar: icon("Calendar"),
    Wrench: icon("Wrench"),
    Pickaxe: icon("Pickaxe"),
    Search: icon("Search"),
    X: icon("X"),
    Menu: icon("Menu"),
    Loader2: icon("Loader2"),
    TrendingUp: icon("TrendingUp"),
    Activity: icon("Activity"),
    Truck: icon("Truck"),
    AlertTriangle: icon("AlertTriangle"),
  };
});

// Mock Sheet components from ui
jest.mock("../components/ui/sheet", () => {
  const React = require("react");
  return {
    Sheet: ({ children }) => <div>{children}</div>,
    SheetTrigger: React.forwardRef(({ children, asChild, ...rest }, ref) =>
      asChild ? (
        React.cloneElement(children, { ref, ...rest })
      ) : (
        <div ref={ref} {...rest}>
          {children}
        </div>
      ),
    ),
    SheetContent: ({ children }) => (
      <div data-testid="sheet-content">{children}</div>
    ),
  };
});

// Mock Button and Input
jest.mock("../components/ui/button", () => {
  const React = require("react");
  return {
    Button: React.forwardRef(({ children, ...rest }, ref) => (
      <button ref={ref} {...rest}>
        {children}
      </button>
    )),
  };
});

jest.mock("../components/ui/input", () => {
  const React = require("react");
  return {
    Input: React.forwardRef((props, ref) => <input ref={ref} {...props} />),
  };
});

// Mock entityStore
jest.mock("../shared/entityStore", () => ({
  useEntityStore: () => ({
    nekretnine: [],
    zakupnici: [],
    ugovori: [],
    maintenance: [],
    loading: false,
  }),
  EntityStoreProvider: ({ children }) => children,
}));

// Mock logo asset
jest.mock("../assets/riforma-logo.png", () => "logo.png");

import { Navigation } from "../components/Navigation";

beforeEach(() => {
  mockNavigate.mockClear();
  mockLogout.mockClear();
});

describe("Navigation", () => {
  it("renders all expected nav items", () => {
    render(<Navigation />);

    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Nekretnine").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Zakupnici").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ugovori").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Odr\u017Eavanje").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Projekti").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Cijene").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Aktivnost").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Dobavljaci").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the logo image", () => {
    render(<Navigation />);
    const logos = screen.getAllByAltText("Riforma");
    expect(logos.length).toBeGreaterThanOrEqual(1);
    expect(logos[0]).toHaveAttribute("src", "logo.png");
  });

  it("renders the TenantSwitcher component", () => {
    render(<Navigation />);
    const switchers = screen.getAllByTestId("tenant-switcher");
    expect(switchers.length).toBeGreaterThanOrEqual(1);
  });

  it("highlights the active nav item based on pathname", () => {
    // Simulate being on /nekretnine
    mockLocation.pathname = "/nekretnine";
    render(<Navigation />);

    // Find links that point to /nekretnine
    const nekretnineLinks = screen.getAllByText("Nekretnine");
    const activeLink = nekretnineLinks.find((el) => {
      const anchor = el.closest("a");
      return anchor && anchor.getAttribute("href") === "/nekretnine";
    });
    expect(activeLink).toBeTruthy();
    // The active link's parent <a> should have the active class
    const anchor = activeLink.closest("a");
    expect(anchor.className).toContain("bg-primary");

    // Reset
    mockLocation.pathname = "/";
  });

  it("calls logout and navigates on TenantSwitcher logout", () => {
    render(<Navigation />);
    const switchers = screen.getAllByTestId("tenant-switcher");
    fireEvent.click(switchers[0]);

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("renders the search icon button", () => {
    render(<Navigation />);
    const searchButtons = screen.getAllByTitle("Pretra\u017Ei (Ctrl+K)");
    expect(searchButtons.length).toBeGreaterThanOrEqual(1);
  });
});
