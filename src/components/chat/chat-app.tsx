"use client";

/**
 * ChatApp — the full-screen chat overlay. Slides open with a layered
 * clip-path wipe (the animejs.com door-opening feel) and routes between
 * the chat phases: gate → lobby → searching → chat → aftermath.
 */
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useChat } from "@/lib/chat-store";
import { EASE } from "@/components/landing/reveal";
import Gate from "./gate";
import Lobby from "./lobby";
import Searching from "./searching";
import ChatRoom from "./chat-room";
import { EndScreen } from "./end-screens";

export default function ChatApp() {
  const open = useChat((s) => s.open);
  const phase = useChat((s) => s.phase);
  const closeChat = useChat((s) => s.closeChat);

  /* lock body scroll while open */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* Esc bails out — but never mid-conversation (too easy to lose a room) */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phase === "chat") return;
      closeChat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, closeChat]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="grain fixed inset-0 z-[100] bg-ink text-cream"
          role="dialog"
          aria-modal="true"
          aria-label="Veil anonymous chat"
          initial={{ clipPath: "inset(50% 0% 50% 0%)" }}
          animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
          exit={{ clipPath: "inset(50% 0% 50% 0%)" }}
          transition={{ duration: 0.62, ease: EASE }}
        >
          {/* lime slit that leads the wipe */}
          <motion.div
            aria-hidden
            className="absolute inset-x-0 top-1/2 z-30 h-[3px] -translate-y-1/2 bg-lime"
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: [0, 1, 1, 0], opacity: [1, 1, 0.9, 0] }}
            exit={{ scaleX: [0, 1, 1, 0], opacity: [0, 1, 0.9, 0] }}
            transition={{ duration: 0.62, ease: EASE, times: [0, 0.4, 0.7, 1] }}
          />

          {/* backdrop: dot grid + vignette */}
          <div aria-hidden className="dot-grid absolute inset-0 opacity-60" />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(80% 60% at 50% 0%, rgba(217,244,80,0.06), transparent 70%), radial-gradient(120% 100% at 50% 120%, rgba(14,14,19,0.9), transparent 60%)",
            }}
          />

          {/* phase router */}
          <div className="relative z-10 flex h-full flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                className="flex min-h-0 flex-1 flex-col"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                {phase === "gate" && <Gate />}
                {phase === "lobby" && <Lobby />}
                {phase === "searching" && <Searching />}
                {phase === "chat" && <ChatRoom />}
                {(phase === "burned" ||
                  phase === "partner-left" ||
                  phase === "lost" ||
                  phase === "banned") && (
                  <EndScreen phase={phase} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
