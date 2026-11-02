export type SearchPreference = "off" | "auto" | "required";
export type GenerationOptions = {
  webSearch?: Exclude<SearchPreference, "off">;
};
export function searchOptions(
  question: string,
  enabled: boolean,
): GenerationOptions {
  const additional =
    /find.{0,40}additional explanations|(?:nájdi|najdi).{0,40}(?:ďalšie|dalsie) vysvetlenia/iu.test(
      question,
    );
  const explicit =
    additional ||
    /(?:search|look\s*up|find|browse).{0,60}(?:web|internet|online|sources)|(?:web|internet|online).{0,40}(?:search|find)|(?:vyhľadaj|vyhladaj|hľadaj|hladaj|nájdi|najdi).{0,60}(?:web|internet|online|zdroj)|(?:najnovšie|najnovsie|latest|current information|aktuálne informácie)/iu.test(
      question,
    );
  return explicit
    ? { webSearch: "required" }
    : enabled
      ? { webSearch: "auto" }
      : {};
}
