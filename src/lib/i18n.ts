export const LANGS = ["es", "en", "fr", "de"] as const;
export type Lang = (typeof LANGS)[number];

const KEY = "fakebtc.lang";

export const LANG_LABEL: Record<Lang, string> = {
  es: "Español",
  en: "Inglés",
  fr: "Francés",
  de: "Alemán",
};

export type Copy = {
  buy: string;
  sell: string;
  margin: string;
  reset: string;
  installTitle: string;
  installBody: string;
  installIos: string;
  installAndroid: string;
  install: string;
  later: string;
  gotIt: string;
};

export const COPY: Record<Lang, Copy> = {
  es: {
    buy: "Comprar",
    sell: "Vender",
    margin: "Margin Call, te has quedado sin fondos",
    reset: "Restablecer todo",
    installTitle: "¿Instalar FakeBTC?",
    installBody: "Añádela a la pantalla de inicio y se abre a pantalla completa.",
    installIos: "En Safari, pulsa Compartir y luego «Añadir a pantalla de inicio».",
    installAndroid: "Abre el menú del navegador y elige «Instalar app» o «Añadir a pantalla de inicio».",
    install: "Instalar",
    later: "Ahora no",
    gotIt: "Entendido",
  },
  en: {
    buy: "Buy",
    sell: "Sell",
    margin: "Margin Call, you are out of funds",
    reset: "Reset all",
    installTitle: "Install FakeBTC?",
    installBody: "Add it to your home screen and it opens full screen.",
    installIos: "In Safari, tap Share, then “Add to Home Screen”.",
    installAndroid: "Open the browser menu and choose “Install app” or “Add to Home screen”.",
    install: "Install",
    later: "Not now",
    gotIt: "Got it",
  },
  fr: {
    buy: "Acheter",
    sell: "Vendre",
    margin: "Margin Call, vous n'avez plus de fonds",
    reset: "Tout réinitialiser",
    installTitle: "Installer FakeBTC ?",
    installBody: "Ajoute-la à l'écran d'accueil pour l'ouvrir en plein écran.",
    installIos: "Dans Safari, appuie sur Partager, puis « Sur l'écran d'accueil ».",
    installAndroid: "Ouvre le menu du navigateur et choisis « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
    install: "Installer",
    later: "Plus tard",
    gotIt: "Compris",
  },
  de: {
    buy: "Kaufen",
    sell: "Verkaufen",
    margin: "Margin Call, du hast kein Guthaben mehr",
    reset: "Alles zurücksetzen",
    installTitle: "FakeBTC installieren?",
    installBody: "Lege sie auf den Startbildschirm, dann öffnet sie sich im Vollbild.",
    installIos: "Tippe in Safari auf Teilen und dann auf „Zum Home-Bildschirm“.",
    installAndroid: "Öffne das Browsermenü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
    install: "Installieren",
    later: "Jetzt nicht",
    gotIt: "Verstanden",
  },
};

export function loadLang(): Lang {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "es" || raw === "en" || raw === "fr" || raw === "de") return raw;
  } catch {
    /* private mode */
  }
  return "es";
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* private mode / quota */
  }
}
