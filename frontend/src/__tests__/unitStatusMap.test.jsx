import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import UnitStatusMap from "../features/properties/UnitStatusMap";

const units = [
  { id: "u1", oznaka: "A1", naziv: null, status: "dostupno", kat: "Kat 1" },
  { id: "u2", oznaka: "A2", naziv: null, status: "iznajmljeno", kat: "Kat 1" },
  { id: "u3", oznaka: "B1", naziv: null, status: "u_odrzavanju", kat: "Kat 2" },
];

const Harness = ({ initialFilter = "svi" }) => {
  const [filter, setFilter] = React.useState(initialFilter);
  return (
    <UnitStatusMap units={units} filter={filter} onFilterChange={setFilter} />
  );
};

test("renders summary cards for unit dataset", () => {
  render(<Harness />);

  const totalCard = screen.getByText(/Ukupno jedinica/i).closest("div");
  expect(totalCard).toBeInTheDocument();
  expect(within(totalCard).getByText("3")).toBeInTheDocument();
});

test("filters units by status using toggle chips", () => {
  render(<Harness />);

  // Unit chips include floor info: "A1 (kat Kat 1)"
  expect(screen.getByText(/^A1/)).toBeInTheDocument();
  expect(screen.getByText(/^A2/)).toBeInTheDocument();
  expect(screen.getByText(/^B1/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Iznajmljeni/i }));

  expect(screen.queryByText(/^A1/)).not.toBeInTheDocument();
  expect(screen.getByText(/^A2/)).toBeInTheDocument();
  expect(screen.queryByText(/^B1/)).not.toBeInTheDocument();
});
