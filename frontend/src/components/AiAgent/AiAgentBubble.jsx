import React, { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "../ui/button";
import { AiAgentPanel } from "./AiAgentPanel";

export function AiAgentBubble() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        size="icon"
        aria-label="Otvori AI asistenta"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      <AiAgentPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
