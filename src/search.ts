export type SearchPreference = "off" | "auto" | "required";
export type GenerationOptions = {
  webSearch?: Exclude<SearchPreference, "off">;
  researchDepth?: "basic" | "standard" | "deep";
  jsonSchema?: { name: string; schema: Record<string, unknown> };
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
  const deep =
    /deep research|research thoroughly|cross.check|independent sources|conflicting|hĺbkov|hlbkov|over.{0,20}zdroj|porovnaj.{0,30}zdroj/iu.test(
      question,
    );
  const current =
    /\b(latest|today|recent|this year|release|deprecated|security advisory)\b|current (?:version|stable|release|status|information)|aktuáln.{0,12}(?:verzi|inform|stav)|najnov|dnes|zastaran/iu.test(
      question,
    );
  return deep
    ? { webSearch: "required", researchDepth: "deep" }
    : explicit || current
      ? { webSearch: "required" }
      : enabled
        ? { webSearch: "auto", researchDepth: "deep" }
        : { webSearch: "auto" };
}

export const researchInstructions = `Web search is available automatically: decide whether it improves accuracy before answering. Basic depth: stable straightforward concepts usually need no search. Standard: use research for uncertainty, specialized topics, incomplete source claims or official technical documentation. Deep: complex/current/contested claims need multiple targeted searches and independent authoritative sources. Prefer primary sources and official programming documentation, cross-check important claims and disclose disagreements or uncertainty. Do not stop at the first result when verification matters; vary source count with the question. Keep research focused and bounded (normally at most 3 searches, deep at most 6); these are guidance, not a provider-enforced cap. Integrate findings into the explanation and distinguish source material, general knowledge and verified online additions. Only claim research when the tool ran and cite the returned URLs; never fabricate sources. Do not call this a dedicated Deep Research service. If search is unavailable, explain the limitation without substituting another provider or billing route.`;
