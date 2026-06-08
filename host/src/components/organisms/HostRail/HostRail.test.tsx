import { render, screen } from "@testing-library/react";
import { HostRail } from ".";

describe("HostRail", () => {
  it("matches the unauthenticated original rail surface", async () => {
    render(<HostRail showReachability={false} />);

    expect(screen.getByRole("button", { name: "Kacho" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Все сервисы" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Поиск" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Virtual Private Cloud" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Compute Cloud" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Network Load Balancer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Identity and Access Management" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Администрирование" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Настройки" })).not.toBeInTheDocument();
  });

  it("enables dashboard launchers when project context exists", async () => {
    render(
      <HostRail
        context={{
          account: { id: "acc-1", name: "Account" },
          project: { id: "project-1", name: "Project", accountId: "acc-1" },
        }}
        currentPath="/projects/project-1/dashboard"
        showReachability={false}
      />,
    );

    expect(await screen.findByRole("button", { name: "Virtual Private Cloud" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Compute Cloud" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Network Load Balancer" })).not.toBeDisabled();
  });

  it("switches to section navigation inside a federated module uri", async () => {
    render(
      <HostRail
        context={{
          account: { id: "acc-1", name: "Account" },
          project: { id: "project-1", name: "Project", accountId: "acc-1" },
        }}
        currentPath="/projects/project-1/vpc/networks"
        showReachability={false}
      />,
    );

    expect(await screen.findByRole("button", { name: "Облачные сети" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "Подсети" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compute Cloud" })).not.toBeInTheDocument();
  });
});
