export const THEME_STORAGE_KEY = "donnaticy-theme";

// Executado antes da pintura para não piscar o tema claro ao recarregar.
export const themeBootstrap = `(function(){var t;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}document.documentElement.dataset.theme=t==="dark"||t==="light"?t:window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"})()`;
