export { CopyableMonoId, fmtTs, groupedRoleOptions, SystemTag, useIamMutation } from "./IamCommon";
export { IamScopedListShell } from "./IamScopedListShell";
export { InlineRoleCreateForm } from "./InlineRoleCreateForm";
export { InlineRoleEditForm } from "./InlineRoleEditForm";
// Только компонент — helper'ы (emptyRule/ruleInvalid/rulesInvalid/WILDCARD)
// импортируются напрямую из ./RulesEditor, чтобы не конфликтовать по имени
// `emptyRule` с form-barrel (SgRulesEditor.emptyRule).
export { RulesEditor } from "./RulesEditor";
