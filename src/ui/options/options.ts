import { sendMessage } from "../../messaging/bus.js";

const consentStatus = document.getElementById("consent-status")!;

async function refresh(): Promise<void> {
  const status = await sendMessage({ type: "GET_STATUS" });
  if (status.type !== "STATUS") return;
  const c = status.settings.consent;
  consentStatus.textContent = c.autoMemoryConsented
    ? `Consented${c.consentedAt ? ` at ${c.consentedAt}` : ""}. Pause=${status.settings.flags.paused}.`
    : "Not consented — Auto-memory idle.";
}

document.getElementById("btn-consent-on")!.addEventListener("click", async () => {
  await sendMessage({ type: "SET_CONSENT", consented: true });
  await sendMessage({ type: "SET_PAUSED", paused: false });
  await refresh();
});

document.getElementById("btn-consent-off")!.addEventListener("click", async () => {
  await sendMessage({ type: "SET_CONSENT", consented: false });
  await refresh();
});

document.getElementById("btn-toggle-pause")!.addEventListener("click", async () => {
  const status = await sendMessage({ type: "GET_STATUS" });
  if (status.type !== "STATUS") return;
  await sendMessage({
    type: "SET_PAUSED",
    paused: !status.settings.flags.paused,
  });
  await refresh();
});

document.getElementById("btn-export")!.addEventListener("click", async () => {
  const reply = await sendMessage({ type: "EXPORT_JSON" });
  if (reply.type !== "EXPORT_RESULT") return;
  const blob = new Blob([reply.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chromeaimemory-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("btn-wipe")!.addEventListener("click", async () => {
  if (prompt("Type WIPE to confirm") !== "WIPE") return;
  await sendMessage({ type: "WIPE_ALL" });
  await refresh();
});

void refresh();
