import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: "/" }),
    useParams: () => ({}),
    Link: ({ children }) => <a href="#">{children}</a>,
  }),
  { virtual: true },
);

jest.mock("../components/ui/sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
}));

const toast = require("../components/ui/sonner").toast;

jest.mock("../shared/api", () => ({
  api: {
    parsePdfContract: jest.fn(),
    createNekretnina: jest.fn(),
    createZakupnik: jest.fn(),
    createUgovor: jest.fn(),
    createUnit: jest.fn(),
  },
  buildDocumentUrl: jest.fn(),
}));

const { api: mockApi } = require("../shared/api");

import DocumentWizard from "../features/documents/DocumentWizard";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const baseProps = {
  nekretnine: [],
  zakupnici: [],
  ugovori: [],
  propertyUnitsByProperty: {},
  propertyUnitsById: {},
  onSubmit: jest.fn().mockResolvedValue(undefined),
  onCancel: jest.fn(),
  refreshEntities: jest.fn().mockResolvedValue(undefined),
  loading: false,
};

const createFile = () =>
  new File(["dummy"], "contract.pdf", { type: "application/pdf" });

beforeEach(() => {
  jest.clearAllMocks();
});

test("advances to meta step after successful upload", async () => {
  mockApi.parsePdfContract.mockResolvedValue({
    data: {
      success: true,
      data: {
        document_type: "ugovor",
      },
    },
  });

  const { container } = render(<DocumentWizard {...baseProps} />);
  const fileInput = container.querySelector("input[type='file']");
  fireEvent.change(fileInput, { target: { files: [createFile()] } });

  await waitFor(() => expect(mockApi.parsePdfContract).toHaveBeenCalled());
  const nextButton = screen.getByRole("button", { name: /Sljedeći korak/i });
  await waitFor(() => expect(nextButton).not.toBeDisabled());

  fireEvent.click(nextButton);

  expect(screen.getByLabelText(/Naziv dokumenta/i)).toBeInTheDocument();
});

test("shows inline error when manual unit is submitted without property", async () => {
  mockApi.parsePdfContract.mockResolvedValue({
    data: {
      success: true,
      data: {
        document_type: "ugovor",
      },
    },
  });

  const { container } = render(<DocumentWizard {...baseProps} />);
  const fileInput = container.querySelector("input[type='file']");
  fireEvent.change(fileInput, { target: { files: [createFile()] } });

  await waitFor(() => expect(mockApi.parsePdfContract).toHaveBeenCalled());
  const nextButton = await screen.findByRole("button", {
    name: /Sljedeći korak/i,
  });
  await waitFor(() => expect(nextButton).not.toBeDisabled());
  fireEvent.click(nextButton);

  const nameInput = screen.getByLabelText(/Naziv dokumenta/i);
  fireEvent.change(nameInput, { target: { value: "Test dokument" } });
  const metaNextButton = await screen.findByRole("button", {
    name: /Sljedeći korak/i,
  });
  fireEvent.click(metaNextButton);

  fireEvent.click(screen.getByRole("button", { name: /Dodaj novu jedinicu/i }));

  const manualFormHeading = screen.getByRole("heading", {
    name: /Nova jedinica/i,
  });
  const manualForm = manualFormHeading.closest("div");
  const oznakaInput = within(manualForm).getByLabelText(/Oznaka/i);
  fireEvent.change(oznakaInput, { target: { value: "A-101" } });

  fireEvent.click(
    within(manualForm).getByRole("button", { name: /Spremi jedinicu/i }),
  );

  expect(
    screen.getByText(/Odaberite nekretninu prije spremanja jedinice/i),
  ).toBeInTheDocument();
  expect(toast.error).not.toHaveBeenCalled();
});

test("creates manual unit when property is selected", async () => {
  mockApi.parsePdfContract.mockResolvedValue({
    data: {
      success: true,
      data: {
        document_type: "ugovor",
      },
    },
  });

  mockApi.createUnit.mockResolvedValue({
    data: {
      id: "unit-1",
      nekretnina_id: "property-1",
    },
  });

  const props = {
    ...baseProps,
    nekretnine: [{ id: "property-1", naziv: "Tower A", adresa: "Glavna 1" }],
  };

  const { container } = render(<DocumentWizard {...props} />);
  const fileInput = container.querySelector("input[type='file']");
  fireEvent.change(fileInput, { target: { files: [createFile()] } });

  await waitFor(() => expect(mockApi.parsePdfContract).toHaveBeenCalled());
  const nextButton = await screen.findByRole("button", {
    name: /Sljedeći korak/i,
  });
  await waitFor(() => expect(nextButton).not.toBeDisabled());
  fireEvent.click(nextButton);

  const nameInput = screen.getByLabelText(/Naziv dokumenta/i);
  fireEvent.change(nameInput, { target: { value: "Test dokument" } });
  const metaNextButton = await screen.findByRole("button", {
    name: /Sljedeći korak/i,
  });
  fireEvent.click(metaNextButton);

  const propertySelect = await screen.findByRole("combobox", {
    name: /Nekretnina/i,
  });
  const hiddenSelect = propertySelect.parentElement.querySelector("select");
  fireEvent.change(hiddenSelect, { target: { value: "property-1" } });
  fireEvent.blur(hiddenSelect);

  fireEvent.click(screen.getByRole("button", { name: /Dodaj novu jedinicu/i }));

  const manualFormHeading = await screen.findByRole("heading", {
    name: /Nova jedinica/i,
  });
  const manualForm = manualFormHeading.closest("div");
  const oznakaInput = within(manualForm).getByLabelText(/Oznaka/i);
  fireEvent.change(oznakaInput, { target: { value: "B-201" } });

  fireEvent.click(
    within(manualForm).getByRole("button", { name: /Spremi jedinicu/i }),
  );

  await waitFor(() => expect(mockApi.createUnit).toHaveBeenCalled());
  expect(props.refreshEntities).toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalledWith("Jedinica je kreirana.");
});
