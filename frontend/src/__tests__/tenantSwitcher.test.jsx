import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../shared/api", () => ({
  api: {
    getTenants: jest.fn().mockResolvedValue({
      data: [
        { id: "tenant-default", naziv: "Primarni portfelj", role: "owner" },
        { id: "tenant-2", naziv: "Drugi portfelj", role: "member" },
      ],
    }),
  },
}));

const { api } = require("../shared/api");

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

jest.mock("../shared/entityStore", () => ({
  useEntityStore: jest.fn(),
}));

const { useEntityStore } = require("../shared/entityStore");

jest.mock("../components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect, ...props }) => (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => onSelect?.(event)}
      {...props}
    >
      {children}
    </button>
  ),
}));
jest.mock("../components/ui/sonner", () => ({
  toast: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const { toast } = require("../components/ui/sonner");

import { TenantSwitcher, clearTenantCache } from "../components/TenantSwitcher";

let originalLocation;

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  clearTenantCache();
  delete window.location;
  window.location = {
    ...window.location,
    reload: jest.fn(),
  };
  api.getTenants.mockResolvedValue({
    data: [
      { id: "tenant-default", naziv: "Primarni portfelj", role: "owner" },
      { id: "tenant-2", naziv: "Drugi portfelj", role: "member" },
    ],
  });
  useEntityStore.mockReset();
  toast.mockClear();
  window.location.reload.mockClear();
});

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  // window.location is reset by jsdom environment usually, but if we modified it on the window object directly
  // we might want to restore it. However, since we used defineProperty on window, we can just leave it or restore if needed.
  // For now, let's just remove the complex restore logic that might fail.
});

it("loads tenants and triggers change handler", async () => {
  const storeMock = {
    tenantId: "tenant-default",
    changeTenant: jest.fn().mockReturnValue("tenant-2"),
  };
  useEntityStore.mockReturnValue(storeMock);

  render(<TenantSwitcher />);

  await waitFor(() => expect(api.getTenants).toHaveBeenCalled());

  const trigger = await screen.findByRole("button", {
    name: /Aktivni portfelj/i,
  });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const option = await screen.findByRole("menuitem", {
    name: /Drugi portfelj/i,
  });
  fireEvent.click(option);

  await waitFor(() =>
    expect(storeMock.changeTenant).toHaveBeenCalledWith("tenant-2"),
  );
  // After tenant change, loadTenants should be called to refresh
  await waitFor(() => expect(api.getTenants).toHaveBeenCalledTimes(2));
});

it("shows settings menu item for navigation", async () => {
  const storeMock = {
    tenantId: "tenant-2",
    changeTenant: jest.fn().mockReturnValue("tenant-3"),
  };
  useEntityStore.mockReturnValue(storeMock);

  render(<TenantSwitcher />);

  await waitFor(() => expect(api.getTenants).toHaveBeenCalled());

  const trigger = await screen.findByRole("button", {
    name: /Aktivni portfelj/i,
  });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const settingsItem = await screen.findByRole("menuitem", {
    name: /Postavke/i,
  });
  expect(settingsItem).toBeInTheDocument();
});
