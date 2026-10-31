// Application-owned status/error text. Provider diagnostics remain available verbatim.
const slovak: Record<string, string> = {
  "Sign-in cancelled.": "Prihlásenie bolo zrušené.",
  "Sign-in timed out after five minutes. Please try again.":
    "Prihlásenie sa po piatich minútach nedokončilo. Skús ho znova.",
  "Unknown command.": "Neznámy príkaz.",
  "Untrusted IPC sender.": "Neoverený odosielateľ požiadavky.",
  "This database requires a newer version of StudyFlow.":
    "Táto databáza vyžaduje novšiu verziu StudyFlow.",
  "Only an unstarted learning path can be edited.":
    "Upraviť sa dá iba študijný plán, ktorý ešte nebol spustený.",
  "The active lesson changed. Refresh before completing it.":
    "Aktívna lekcia sa zmenila. Pred dokončením obnov zobrazenie.",
  "Completion event not found.": "Záznam o dokončení sa nenašiel.",
  "Finish sign-in and authorize ChatGPT plan usage in your system browser.":
    "Dokonči prihlásenie a povoľ používanie plánu ChatGPT v systémovom prehliadači.",
  "Verified: a real ChatGPT plan response reached response.completed.":
    "Overené: skutočná odpoveď cez plán ChatGPT bola úspešne dokončená.",
  "Disconnected. Local tokens cleared.":
    "Účet bol odpojený. Lokálne prihlasovacie údaje boli odstránené.",
  "Local tokens cleared. Remote revocation was not confirmed; disconnect StudyFlow in ChatGPT Settings → Apps.":
    "Lokálne prihlasovacie údaje boli odstránené. Zrušenie oprávnenia na serveri sa nepotvrdilo; odpoj StudyFlow v nastaveniach ChatGPT → Aplikácie.",
  "Windows credential protection is unavailable. Credentials will not be saved in plaintext.":
    "Ochrana prihlasovacích údajov systému Windows nie je dostupná. Údaje nebudú uložené v nezašifrovanej podobe.",
  "Protected account storage could not be read. No existing credentials were overwritten.":
    "Chránené úložisko účtu sa nepodarilo načítať. Existujúce prihlasovacie údaje neboli prepísané.",
  "Could not start local OAuth callback.":
    "Nepodarilo sa spustiť lokálny príjem prihlásenia OAuth.",
  "No identity token returned.": "Server nevrátil identifikačný token.",
  "Identity validation failed.": "Overenie identity zlyhalo.",
  "Signed-in identity differs from the saved account.":
    "Prihlásený účet sa nezhoduje s uloženým účtom.",
  "Signed in, but ChatGPT plan usage was not granted. Inference is disabled.":
    "Prihlásenie prebehlo, ale používanie plánu ChatGPT nebolo povolené. Odpovede AI sú vypnuté.",
  "OpenAI returned an incomplete token set.":
    "OpenAI vrátil neúplné prihlasovacie údaje.",
  "Unexpected ChatGPT model catalog response.":
    "Server vrátil neočakávaný zoznam modelov ChatGPT.",
  "OAuth state mismatch. Start sign-in again.":
    "Overenie prihlásenia OAuth sa nezhoduje. Spusti prihlásenie znova.",
  "Sign-in was declined or could not finish. Start sign-in again.":
    "Prihlásenie bolo odmietnuté alebo sa nedokončilo. Spusti ho znova.",
  "Registration did not return an issued client ID.":
    "Registrácia nevrátila platný identifikátor klienta.",
  "Returned registration does not match the selected account.":
    "Vrátená registrácia sa nezhoduje s vybraným účtom.",
  "Authorization code missing or invalid.":
    "Autorizačný kód chýba alebo je neplatný.",
  "Stream event exceeds the safety limit.":
    "Časť streamovanej odpovede presiahla bezpečnostný limit.",
  "Stream ended without response.completed; integration is not verified.":
    "Prenos sa skončil bez potvrdenia dokončenia odpovede. Pripojenie nie je overené.",
  "Response completed without a text explanation; integration is not verified.":
    "Odpoveď bola dokončená bez textového vysvetlenia. Pripojenie nie je overené.",
  "Use a public HTTPS URL without embedded credentials or a custom port.":
    "Použi verejný odkaz HTTPS bez vložených prihlasovacích údajov a vlastného portu.",
  "Webpage exceeds the 5 MB import limit.":
    "Webová stránka presahuje limit importu 5 MB.",
  "Website request timed out. Paste the relevant text instead.":
    "Načítanie stránky trvalo príliš dlho. Vlož potrebný text ručne.",
  "The operation was aborted.": "Operácia bola zrušená.",
  "This operation was aborted": "Operácia bola zrušená.",
  "Operation failed.": "Operácia zlyhala.",
  "Conversation not found.": "Konverzácia sa nenašla.",
  "Course not found.": "Kurz sa nenašiel.",
  "Lesson not found.": "Lekcia sa nenašla.",
  "Source not found.": "Zdroj sa nenašiel.",
  "Write a message or attach a file.": "Napíš správu alebo prilož súbor.",
  "Attach at most 8 files per message.":
    "K jednej správe prilož najviac 8 súborov.",
  "Attachments are too large to send together. Remove some images or attach a smaller file.":
    "Prílohy sú spolu príliš veľké. Odstráň niektoré obrázky alebo prilož menší súbor.",
  "Only part of this attachment fits in the chat context. Use Study Mode for the full document.":
    "Do kontextu chatu sa zmestí iba časť tejto prílohy. Pre celý dokument použi študijný režim.",
  "Connect your ChatGPT account first.": "Najprv pripoj svoj účet ChatGPT.",
  "Connect your account and select a model in Settings.":
    "V nastaveniach pripoj účet a vyber model.",
  "Select an available model in Settings.":
    "Vyber dostupný model v nastaveniach.",
  "Select an available account model.": "Vyber dostupný model svojho účtu.",
  "No selectable models are available for this account.":
    "Pre tento účet nie sú dostupné žiadne modely.",
  "ChatGPT plan usage is not authorized.":
    "Používanie plánu ChatGPT nebolo povolené.",
  "ChatGPT plan permission is no longer granted.":
    "Povolenie používať plán ChatGPT už nie je platné.",
  "Session expired or revoked. Please sign in again.":
    "Prihlásenie vypršalo alebo bolo zrušené. Prihlás sa znova.",
  "An operation is already running.": "Práve prebieha iná operácia.",
  "Wait for the current tutor response or cancel it first.":
    "Počkaj na odpoveď tútora alebo ju najprv zastav.",
  "Cancel or wait for the current response before changing lessons.":
    "Pred zmenou lekcie počkaj na odpoveď alebo ju zastav.",
  "Choose a non-empty file smaller than 30 MB.":
    "Vyber neprázdny súbor menší ako 30 MB.",
  "Supported files: PDF, PPTX, PNG, JPG, WebP, TXT and Markdown.":
    "Podporované súbory: PDF, PPTX, PNG, JPG, WebP, TXT a Markdown.",
  "This file is not a valid PDF.": "Tento súbor nie je platný dokument PDF.",
  "Please split PDFs longer than 500 pages into smaller documents.":
    "PDF s viac ako 500 stranami rozdeľ na menšie dokumenty.",
  "This PDF contains little or no selectable text. Import screenshots of its pages instead.":
    "PDF obsahuje málo alebo žiadny označiteľný text. Importuj snímky jeho strán.",
  "Presentation expands beyond the 150 MB safety limit.":
    "Rozbalená prezentácia presahuje bezpečnostný limit 150 MB.",
  "The presentation slide order could not be resolved safely.":
    "Nepodarilo sa spoľahlivo určiť poradie snímok prezentácie.",
  "Presentation must contain between 1 and 500 slides.":
    "Prezentácia musí obsahovať 1 až 500 snímok.",
  "Image signature is invalid.": "Súbor neobsahuje platný podporovaný obrázok.",
  "Please use an image smaller than 10 MB.": "Použi obrázok menší ako 10 MB.",
  "This document is too large. Split it into smaller study sections.":
    "Dokument je príliš veľký. Rozdeľ ho na menšie študijné časti.",
  "No usable learning content was found.":
    "Nenašiel sa použiteľný študijný obsah.",
  "The tutor returned an invalid learning path. Please try generating it again.":
    "Tútor vrátil neplatný študijný plán. Skús ho vytvoriť znova.",
  "PDF text extracted with page references. Diagrams and scanned pages are not interpreted; import screenshots for visual explanations.":
    "Text PDF bol načítaný s odkazmi na strany. Diagramy a skenované strany sa neanalyzujú; pre vizuálne vysvetlenie importuj snímky obrazovky.",
  "Slide text is kept in slide order. Embedded images are included separately; slide layout and charts are not rendered. Import screenshots for diagrams that need exact visual context.":
    "Text je zachovaný v poradí snímok. Vložené obrázky sú priložené samostatne; rozloženie snímok a grafy sa nevykresľujú. Pre presný vizuálny kontext importuj snímky obrazovky.",
  "Only the supplied text is analyzed; no original audio or video was watched.":
    "Analyzuje sa iba dodaný text; pôvodný zvuk ani video neboli spracované.",
  "Only publicly accessible captions were analyzed. No audio or video was processed.":
    "Analyzovali sa iba verejne dostupné titulky. Zvuk ani video neboli spracované.",
  "Readable webpage text only. Interactive content and diagrams are not captured.":
    "Načítaný bol iba čitateľný text stránky. Interaktívny obsah a diagramy nie sú zahrnuté.",
  "Use a YouTube watch link or paste the transcript below.":
    "Použi odkaz na video YouTube alebo nižšie vlož prepis.",
  "No publicly accessible captions were available. Paste a transcript below. StudyFlow has not watched the video.":
    "Verejné titulky nie sú dostupné. Nižšie vlož prepis. StudyFlow video nevidel.",
  "Captions could not be read. Paste a transcript below; the video itself was not analyzed.":
    "Titulky sa nepodarilo načítať. Nižšie vlož prepis; samotné video nebolo analyzované.",
  "No readable educational text was found. Paste the relevant text below.":
    "Nenašiel sa čitateľný študijný text. Vlož ho nižšie.",
  "Local and private network URLs cannot be imported.":
    "Odkazy na lokálnu a súkromnú sieť sa nedajú importovať.",
  "Too many website redirects.": "Stránka má príliš veľa presmerovaní.",
  "Open the StudyFlow desktop application to use local files and your ChatGPT connection.":
    "Pre lokálne súbory a pripojenie ChatGPT otvor počítačovú aplikáciu StudyFlow.",
  "Account verified. Select a model and run the live lesson test.":
    "Účet je overený. Vyber model a spusti test pripojenia.",
};
export function localizeMessage(text: string, language: string): string {
  if (language !== "sk" || !text) return text;
  if (slovak[text]) return slovak[text];
  const analysis = /^Analyzing material (\d+)\/(\d+)$/.exec(text);
  if (analysis) return `Analyzujem materiál ${analysis[1]}/${analysis[2]}`;
  const http =
    /^Website returned HTTP (\d+). Paste the relevant text instead.$/.exec(
      text,
    );
  if (http)
    return `Stránka vrátila chybu HTTP ${http[1]}. Vlož potrebný text ručne.`;
  if (text.startsWith("OpenAI HTTP "))
    return text
      .replace("Request ID:", "Identifikátor požiadavky:")
      .replace("unavailable", "nedostupný");
  if (text.startsWith("Inference stopped: "))
    return text
      .replace("Inference stopped:", "Odpoveď AI bola zastavená:")
      .replace(
        "No alternate billing was used.",
        "Nebola použitá žiadna iná platená služba.",
      );
  if (text.startsWith("Expected a streaming response."))
    return (
      "Očakávala sa streamovaná odpoveď. " +
      text.slice("Expected a streaming response.".length).trim()
    );
  // Warnings may combine extraction details and context limits.
  let translated = text;
  for (const [english, sk] of Object.entries(slovak))
    translated = translated.replaceAll(english, sk);
  return translated;
}
