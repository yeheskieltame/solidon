// Light / dark theme. The tokens live in globals.css on html[data-theme]; this file holds
// the storage key and the inline script the root layout runs in <head> before first paint.

export type Theme = "light" | "dark";

/** localStorage key for an explicit choice. Without one the theme follows the system. */
export const THEME_KEY = "solidon-theme";

/**
 * A stored choice wins, then the system preference, then dark. Until the visitor picks a
 * theme it also follows system changes.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,k="${THEME_KEY}",q="(prefers-color-scheme: light)";function s(){try{var v=localStorage.getItem(k);return v==="light"||v==="dark"?v:null}catch(e){return null}}function y(){try{return matchMedia(q).matches?"light":"dark"}catch(e){return"dark"}}d.setAttribute("data-theme",s()||y());try{matchMedia(q).addEventListener("change",function(){if(!s())d.setAttribute("data-theme",y())})}catch(e){}})()`;
