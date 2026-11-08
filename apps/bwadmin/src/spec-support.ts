import * as messages from "@bitwarden/cli/locales/en/messages.json";

// Resolves $n$ placeholders against the en catalog, mirroring I18nService.t.
export function mockI18nT(key: string, ...args: (string | number)[]): string {
  return (messages[key as keyof typeof messages]?.message ?? key).replace(
    /\$(\d+)\$/g,
    (_: string, index: string) => String(args[Number(index) - 1] ?? ""),
  );
}
