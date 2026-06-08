import { render, screen } from "@testing-library/react";
import { jest } from "@jest/globals";
import App from "./App";

const jsonResponse = (body: unknown) => {
  return Promise.resolve({
    ok: true,
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText: "OK",
  } as Response);
};

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState(null, "", "/");
    jest.spyOn(global, "fetch").mockImplementation(() => jsonResponse({ accounts: [] }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the host shell without non-original header actions", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Сервисы облака" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Включить тёмную тему" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Поиск" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "API reachability" })).not.toBeInTheDocument();
  });

  it("hydrates project dashboard context from the route", async () => {
    window.history.pushState(null, "", "/projects/project-1/dashboard");

    render(<App />);

    expect((await screen.findAllByText("project-1")).length).toBeGreaterThan(0);
  });

  it("registers project module routes in the host", async () => {
    window.history.pushState(null, "", "/projects/project-1/vpc/networks");

    render(<App />);

    expect(await screen.findByTestId("module-placeholder-page")).toBeInTheDocument();
    expect(screen.getByText("Virtual Private Cloud")).toBeInTheDocument();
  });
});
