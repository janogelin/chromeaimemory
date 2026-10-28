import { isMessage, type Message } from "../types/messages.js";

export type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender
) => Promise<Message | void> | Message | void;

export function onMessage(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (!isMessage(raw)) return false;
    Promise.resolve(handler(raw, sender))
      .then((reply) => {
        if (reply) sendResponse(reply);
        else sendResponse({ type: "PONG", version: "0.1.0" } satisfies Message);
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        sendResponse({ type: "ERROR", error } satisfies Message);
      });
    return true;
  });
}

export async function sendMessage(message: Message): Promise<Message> {
  const reply = (await chrome.runtime.sendMessage(message)) as unknown;
  if (!isMessage(reply)) {
    return { type: "ERROR", error: "Invalid reply from extension" };
  }
  return reply;
}

export async function sendToTab(
  tabId: number,
  message: Message
): Promise<Message | void> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as Message;
  } catch {
    return undefined;
  }
}
