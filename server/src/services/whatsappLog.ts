import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface LogInboundParams {
  sessionId: string;
  wamid?: string | null;
  messageType: string;
  body?: string | null;
  mediaUrl?: string | null;
  state?: string | null;
}

interface LogOutboundParams {
  to: string;
  wamid?: string | null;
  messageType: string;
  body?: string | null;
  mediaUrl?: string | null;
}

export async function logInboundMessage(params: LogInboundParams): Promise<void> {
  try {
    await prisma.whatsAppMessage.create({
      data: {
        sessionId: params.sessionId,
        direction: "in",
        wamid: params.wamid ?? null,
        messageType: params.messageType,
        body: params.body ?? null,
        mediaUrl: params.mediaUrl ?? null,
        state: params.state ?? null,
      },
    });
  } catch (err) {
    console.error("[whatsappLog] failed to log inbound", err);
  }
}

export async function logOutboundIfPossible(params: LogOutboundParams): Promise<void> {
  try {
    const session = await prisma.whatsAppSession.findUnique({
      where: { phoneNumber: params.to },
      select: { id: true, state: true },
    });
    if (!session) return;
    await prisma.whatsAppMessage.create({
      data: {
        sessionId: session.id,
        direction: "out",
        wamid: params.wamid ?? null,
        messageType: params.messageType,
        body: params.body ?? null,
        mediaUrl: params.mediaUrl ?? null,
        state: session.state ?? null,
      },
    });
  } catch (err) {
    console.error("[whatsappLog] failed to log outbound", err);
  }
}
