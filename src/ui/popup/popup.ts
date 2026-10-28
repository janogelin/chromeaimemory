import { sendMessage } from "../../messaging/bus.js";
import type { Message } from "../../types/messages.js";

const el = {
  auth: document.getElementById("auth")!,
  auto: document.getElementById("auto")!,
  count: document.getElementById("count")!,
  consentGate: document.getElementById("consent-gate")!,
  btnConsent: document.getElementById("btn-consent") as HTMLButtonElement,
  btnPause: document.getElementById("btn-pause") as HTMLButtonElement,
  btnSide: document.getElementById("btn-sidepanel") as HTMLButtonElement,
  hint: document.getElementById("hint")!,
};

async function refresh(): Promise<void> {
  const reply = await sendMessage({ type: "GET_STATUS" });
  if (reply.type !== "STATUS") {
    el.hint.textContent = reply.type === "ERROR" ? reply.error : "No status";
    return;
  }
  render(reply);
}

function render(status: Extract<Message, { type: "STATUS" }>): void {
  const { settings, auth, memoryCount } = status;
  el.auth.textContent =
    auth.status === "signed_in"
      ? "Signed in"
      : auth.status === "signed_out"
        ? "Signed out"
        : "Unknown — open claude.ai";
  el.count.textContent = String(memoryCount);

  const consented = settings.consent.autoMemoryConsented;
  const paused = settings.flags.paused;
  el.consentGate.classList.toggle("hidden", consented);
  el.btnPause.disabled = !consented;
  el.btnPause.textContent = paused ? "Resume" : "Pause";

  if (!consented) {
    el.auto.textContent = "Off (consent required)";
  } else if (paused) {
    el.auto.textContent = "Paused";
  } else if (auth.status !== "signed_in") {
    el.auto.textContent = "Waiting for Claude login";
  } else {
    el.auto.textContent = "On";
  }

  if (auth.status === "signed_out") {
    el.hint.textContent = "Log into claude.ai in this profile (no new account).";
  } else if (!consented) {
    el.hint.textContent = "Consent required before observe / learn / inject.";
  } else {
    el.hint.textContent = paused
      ? "Paused — learn and inject are idle."
      : "Pack panel shows exactly what Claude receives.";
  }
}

el.btnConsent.addEventListener("click", async () => {
  await sendMessage({ type: "SET_CONSENT", consented: true });
  await sendMessage({ type: "SET_PAUSED", paused: false });
  await refresh();
});

el.btnPause.addEventListener("click", async () => {
  const status = await sendMessage({ type: "GET_STATUS" });
  if (status.type !== "STATUS") return;
  await sendMessage({
    type: "SET_PAUSED",
    paused: !status.settings.flags.paused,
  });
  await refresh();
});

el.btnSide.addEventListener("click", async () => {
  await sendMessage({ type: "OPEN_SIDEPANEL" });
});

void refresh();
