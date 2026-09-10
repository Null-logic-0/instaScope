import { $ } from "../dom.js";

export const logLine = (message) => {
  $("log").textContent += message + "\n";
  $("log").scrollTop = $("log").scrollHeight;
};

export const fail = (error) => logLine(`[workbench] ${error && error.message ? error.message : error}`);

export function mountLog() {
  document.addEventListener("instascope:log", (event) => logLine(event.detail));
}
