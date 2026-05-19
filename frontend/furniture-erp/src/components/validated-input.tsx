import * as React from "react";
import { Input } from "@/components/ui/input";
import { applyInputRule, type InputRuleKey } from "@/lib/form-validation";

type ValidatedInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  field: { value?: string | null; onChange: (value: string) => void };
  rule: InputRuleKey;
};

/** Input with shared sanitization + max length (pair `rule` with `zodFields` / schemas in form-validation). */
export function ValidatedInput({ field, rule, ...props }: ValidatedInputProps) {
  return <Input {...applyInputRule(rule, field, props)} />;
}
