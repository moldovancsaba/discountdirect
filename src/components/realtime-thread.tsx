"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BannerNotice } from "@discountdirect/gds-client";
import { io } from "socket.io-client";

type State = "connecting" | "connected" | "reconnecting" | "disabled" | "degraded";

export function RealtimeThread({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("connecting");
  useEffect(() => {
    const socket = io({ path: "/api/socket-io", transports: ["websocket"], addTrailingSlash: false, reconnectionDelay: 1000, reconnectionDelayMax: 30_000, timeout: 8_000 });
    const subscribe = () => socket.emit("conversation.subscribe", { conversationId }, (result: { error?: { code?: string } }) => setState(result.error?.code === "REALTIME_DISABLED" ? "disabled" : result.error ? "degraded" : "connected"));
    socket.on("connect", subscribe);
    socket.on("connect_error", (error) => setState(error.message === "REALTIME_DISABLED" ? "disabled" : "degraded"));
    socket.on("disconnect", () => setState("reconnecting"));
    socket.on("message.created", () => router.refresh());
    socket.on("offer.updated", () => router.refresh());
    socket.on("presence.changed", () => router.refresh());
    socket.on("realtime.status", () => setState("degraded"));
    const heartbeat = window.setInterval(() => socket.emit("presence.heartbeat", { conversationId }), 30_000);
    return () => { window.clearInterval(heartbeat); socket.close(); };
  }, [conversationId, router]);
  if (state === "connected") return <BannerNotice severity="success" variant="compact" message="Élő frissítés kapcsolódva. Kapcsolatcsere után az idővonal automatikusan helyreáll." />;
  if (state === "connecting") return <BannerNotice severity="info" variant="compact" message="Élő frissítés kapcsolódik… Az üzenetek közben tartósan mentve vannak." />;
  if (state === "reconnecting") return <BannerNotice severity="warning" variant="compact" message="Az élő kapcsolat újracsatlakozik. Az idővonal a tartós eseménynaplóból helyreáll." />;
  if (state === "disabled") return <BannerNotice severity="info" variant="compact" message="Az élő frissítés jelenleg kikapcsolva van. Az üzenetek továbbra is tartósan mentve vannak." />;
  return <BannerNotice severity="warning" variant="compact" message="Az élő frissítés átmenetileg nem érhető el. Frissítsd az oldalt; az üzenetek nem vesznek el." />;
}
