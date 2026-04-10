export interface WhatsAppSendTextParams {
  to: string;
  body: string;
}

export interface WhatsAppSendButtonsParams {
  to: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
}

export interface IncomingWhatsAppMessage {
  from: string;
  type: string;
  text?: string;
  imageId?: string;
  interactiveReplyId?: string;
  interactiveReplyTitle?: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getGraphApiUrl(): string {
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v22.0";
  const phoneNumberId = getRequiredEnv("WHATSAPP_PHONE_NUMBER_ID");
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

export async function sendWhatsAppTextMessage(params: WhatsAppSendTextParams): Promise<void> {
  const token = getRequiredEnv("WHATSAPP_TOKEN");
  const url = getGraphApiUrl();
  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "text",
    text: { body: params.body },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`WhatsApp send failed: ${message}`);
  }
}

export async function sendWhatsAppButtonsMessage(params: WhatsAppSendButtonsParams): Promise<void> {
  const token = getRequiredEnv("WHATSAPP_TOKEN");
  const url = getGraphApiUrl();
  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: params.body },
      action: {
        buttons: params.buttons.slice(0, 3).map((btn) => ({
          type: "reply",
          reply: { id: btn.id, title: btn.title },
        })),
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`WhatsApp buttons send failed: ${message}`);
  }
}

export function normalizePhoneNumber(raw: string): string {
  return String(raw || "").replace(/[^\d]/g, "");
}

export async function downloadWhatsAppMedia(imageId: string): Promise<{ base64: string; mimeType: string }> {
  const token = getRequiredEnv("WHATSAPP_TOKEN");
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v22.0";

  // Step 1: Retrieve the media download URL from Meta
  const metaRes = await fetch(`https://graph.facebook.com/${version}/${imageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to get WhatsApp media URL: ${await metaRes.text()}`);
  }
  const metaData = (await metaRes.json()) as { url: string; mime_type: string };

  // Step 2: Download the actual image bytes
  const mediaRes = await fetch(metaData.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!mediaRes.ok) {
    throw new Error(`Failed to download WhatsApp media: ${await mediaRes.text()}`);
  }
  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType: metaData.mime_type || "image/jpeg" };
}

export async function uploadWhatsAppMedia(base64: string, mimeType: string): Promise<string> {
  const token = getRequiredEnv("WHATSAPP_TOKEN");
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
  const phoneNumberId = getRequiredEnv("WHATSAPP_PHONE_NUMBER_ID");

  const buffer = Buffer.from(base64, "base64");
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  formData.append("file", new Blob([buffer], { type: mimeType }), "product.jpg");

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload media to WhatsApp: ${await response.text()}`);
  }
  const data = (await response.json()) as { id: string };
  return data.id;
}

export async function sendWhatsAppImageById(params: { to: string; mediaId: string }): Promise<void> {
  const token = getRequiredEnv("WHATSAPP_TOKEN");
  const url = getGraphApiUrl();
  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "image",
    image: { id: params.mediaId },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp image send failed: ${await response.text()}`);
  }
}

export function extractIncomingMessages(payload: any): IncomingWhatsAppMessage[] {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const result: IncomingWhatsAppMessage[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
      for (const message of messages) {
        const from = String(message?.from || "");
        const type = String(message?.type || "");
        if (!from || !type) continue;
        result.push({
          from: normalizePhoneNumber(from),
          type,
          text: message?.text?.body,
          imageId: message?.image?.id,
          interactiveReplyId: message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id,
          interactiveReplyTitle: message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title,
        });
      }
    }
  }

  return result;
}
