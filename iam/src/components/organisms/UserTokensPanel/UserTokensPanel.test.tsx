import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expectedExports = ["UserTokensPanel"] as const;

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "UserTokensPanel.tsx"), "utf8");

describe("UserTokensPanel", () => {
  it("declares its public component exports", () => {
    for (const exportName of expectedExports) {
      expect(source).toContain(exportName);
    }
  });

  it("wires the one-time secret reveal (copy + download) and revoke", () => {
    // Секрет читается из Operation.response и показывается ВНУТРИ create-модалки
    // (create-форма сменяется на secret-view), не отдельной модалкой.
    expect(source).toContain("private_key_pem");
    expect(source).toContain("SecretBody");
    // Копировать + скачать + предупреждение о том, что ключ больше не покажут.
    expect(source).toContain("createObjectURL");
    expect(source).toContain("Сохраните ключ");
    // Выпуск/отзыв — async через Operation (useIamMutation), без прямого fetch-слоя.
    expect(source).toContain("useIamMutation");
    // Пути ведут на коллекцию токенов пользователя: /iam/v1/users/{userId}/tokens.
    expect(source).toContain("userTokensPath");
    expect(source).toContain("userId");
  });

  it("renders as a standard resource: name column, kebab revoke, empty-state CTA, header store", () => {
    // Колонки стандартного ресурса: Имя (name→description) + Идентификатор + даты.
    expect(source).toContain("Имя");
    expect(source).toContain("Дата создания");
    // Per-row действия — kebab-меню с единственным danger «Отозвать».
    expect(source).toContain("MoreOutlined");
    expect(source).toContain("Отозвать");
    // Empty-state с CTA + метки через базовый LabelsEditor.
    expect(source).toContain("Создайте свой первый токен");
    expect(source).toContain("LabelsEditor");
    // CTA «Создать токен» в шапке — состояние модалки через общий open-store.
    expect(source).toContain("openStore");
  });
});
