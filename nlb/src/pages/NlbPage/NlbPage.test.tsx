import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { jest } from "@jest/globals";
import { NlbPage } from "./NlbPage";

describe("NlbPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState(null, "", "/");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the NLB remote shell placeholder without console noise", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    render(
      <MemoryRouter>
        <NlbPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Network Load Balancing" })).toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
