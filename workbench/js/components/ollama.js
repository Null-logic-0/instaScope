import { $ } from "../dom.js";
import { subject } from "./data.js";
import { fail, logLine } from "./log.js";

const STATE_LABELS = {
  ready: "Model ready",
  model_missing: "Model unavailable",
  unavailable: "Ollama unavailable",
};

export const refreshStatus = async () => {
  $("status").innerHTML = '<span class="dot"></span>Checking…';
  const status = await instaScope.ai.status();
  $("status").innerHTML =
    `<span class="dot ${status.state}"></span><strong>${STATE_LABELS[status.state]}</strong> — ${status.detail}`;
  $("classify").disabled = $("explain").disabled = status.state !== "ready";
};

const applyConfig = () => {
  instaScope.ai.configure({ baseUrl: $("baseUrl").value, model: $("model").value });
  refreshStatus().catch(fail);
};

const classify = async () => {
  $("progress").textContent = "Classifying…";
  try {
    const result = await instaScope.ai.classify({
      subject: subject(),
      dataset: "snapshot",
      onProgress: ({ done, total }) => {
        $("progress").textContent = `Classifying profiles: ${done} / ${total}`;
      },
    });
    $("progress").textContent =
      `${result.stopReason}: ${result.classified} classified, ${result.skipped} already done, ` +
      `${result.unresolved.length} unresolved`;
  } catch (error) {
    fail(error);
    $("progress").textContent = "";
  }
};

const explain = async () => {
  $("report").textContent = "Asking the model…";
  try {
    $("report").textContent = (await instaScope.ai.report(subject())).text;
  } catch (error) {
    fail(error);
    $("report").textContent = "";
  }
};

export function mountOllama() {
  const config = instaScope.ai.config();
  $("baseUrl").value = config.baseUrl;
  $("model").value = config.model;
  $("recheck").onclick = () => refreshStatus().catch(fail);
  $("apply").onclick = applyConfig;
  $("classify").onclick = classify;
  $("cancel").onclick = () => {
    if (!instaScope.ai.cancel()) logLine("[workbench] nothing to cancel");
  };
  $("explain").onclick = explain;
  refreshStatus().catch(fail);
}
