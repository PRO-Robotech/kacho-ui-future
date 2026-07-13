import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expectedExports = ["SaKeysPanel", "SaKeyCreateForm"] as const;

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "SaKeysPanel.tsx"), "utf8");

describe("SaKeysPanel", () => {
  it("declares its public component exports", () => {
    for (const exportName of expectedExports) {
      expect(source).toContain(exportName);
    }
  });

  it("wires the one-time secret reveal (copy + download) via an after-create modal and revoke", () => {
    // Секрет читается из Operation.response и показывается ОДИН раз after-create
    // МОДАЛКОЙ (SecretBody внутри TokenSecretModal), не inline в create-форме.
    expect(source).toContain("private_key_pem");
    expect(source).toContain("SecretBody");
    expect(source).toContain("TokenSecretModal");
    // Копировать + скачать + предупреждение о том, что ключ больше не покажут.
    expect(source).toContain("createObjectURL");
    expect(source).toContain("Сохраните ключ");
    // Выпуск/отзыв — async через Operation (useIamMutation), без прямого fetch-слоя.
    expect(source).toContain("useIamMutation");
    expect(source).toContain("saKeysPath");
  });

  it("creates via a zone-3 form (not a modal): FormShell/FormFooter + secret-store handoff", () => {
    // Создание — ФОРМА в зоне-3 (childCreate), FormShell/FormFooter как inline-create
    // смежных ресурсов IAM — не модалка.
    expect(source).toContain("FormShell");
    expect(source).toContain("FormFooter");
    // Секрет передаётся форма→таблица через secret-store (разные поддеревья).
    expect(source).toContain("secretStore");
    expect(source).toContain("useSecretStore");
    // Метки — базовый LabelsEditor.
    expect(source).toContain("LabelsEditor");
  });

  it("renders as a standard resource: name column, kebab revoke, empty-state CTA", () => {
    // Колонки стандартного ресурса: Имя (name→description) + Идентификатор + даты.
    expect(source).toContain("Имя");
    expect(source).toContain("Дата создания");
    // Per-row действия — kebab-меню с единственным danger «Отозвать».
    expect(source).toContain("MoreOutlined");
    expect(source).toContain("Отозвать");
    // Empty-state с CTA → зона-3 create-форма через onCreate.
    expect(source).toContain("Создайте свой первый токен");
    expect(source).toContain("onCreate");
  });
});
