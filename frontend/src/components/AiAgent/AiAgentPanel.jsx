import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import {
  Loader2,
  Send,
  Plus,
  MessageSquare,
  Trash2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { api, getErrorMessage } from "../../shared/api";
import { toast } from "../ui/sonner";

export function AiAgentPanel({ open, onOpenChange }) {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages]);

  // Fetch conversations when panel opens
  useEffect(() => {
    if (open) {
      fetchConversations();
    }
  }, [open]);

  const fetchConversations = async () => {
    setLoadingConvs(true);
    try {
      const res = await api.agentListConversations();
      setConversations(res.data);
    } catch (err) {
      console.error("Failed to fetch conversations", err);
    } finally {
      setLoadingConvs(false);
    }
  };

  const loadConversation = async (id) => {
    setActiveConvId(id);
    setMessages([]);
    try {
      const res = await api.agentGetConversation(id);
      setMessages(res.data.messages || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const startNewConversation = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    if (textareaRef.current) textareaRef.current.focus();
  };

  const deleteConversation = async (id, e) => {
    e.stopPropagation();
    try {
      await api.agentDeleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: text, created_at: new Date().toISOString() },
    ]);

    try {
      let convId = activeConvId;

      // Auto-create conversation if none active
      if (!convId) {
        const convRes = await api.agentCreateConversation({
          title: text.slice(0, 60),
        });
        convId = convRes.data.id;
        setActiveConvId(convId);
        setConversations((prev) => [convRes.data, ...prev]);
      }

      const res = await api.agentSendMessage(convId, { content: text });

      // Replace temp message with real one and add assistant reply
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempId);
        return [
          ...filtered,
          res.data.user_message,
          res.data.assistant_message,
        ];
      });

      // Update conversation title in list
      const title = text.slice(0, 60);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId && c.title === "Novi razgovor"
            ? { ...c, title }
            : c,
        ),
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }, [input, loading, activeConvId]);

  const handleConfirm = async (messageId, confirmed) => {
    if (!activeConvId) return;
    setLoading(true);
    try {
      const res = await api.agentConfirmAction(activeConvId, {
        message_id: messageId,
        confirmed,
      });

      // Clear pending_action from the original message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, pending_action: null } : m,
        ),
      );

      // Add the result message
      if (res.data.message) {
        setMessages((prev) => [...prev, res.data.message]);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-lg p-0"
      >
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">AI Asistent</SheetTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={startNewConversation}
            >
              <Plus className="mr-1 h-4 w-4" />
              Novi
            </Button>
          </div>
          <SheetDescription className="sr-only">
            Razgovarajte s AI asistentom o vašim nekretninama
          </SheetDescription>
        </SheetHeader>

        {/* Conversation badges */}
        {conversations.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2">
            {conversations.map((conv) => (
              <Badge
                key={conv.id}
                variant={conv.id === activeConvId ? "default" : "secondary"}
                className="cursor-pointer whitespace-nowrap group flex items-center gap-1"
                onClick={() => loadConversation(conv.id)}
              >
                <span className="max-w-[120px] truncate text-xs">
                  {conv.title}
                </span>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Obriši razgovor"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 px-4 py-3">
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm font-medium">Kako vam mogu pomoći?</p>
              <p className="text-xs mt-1">
                Pitajte me o nekretninama, zakupnicima, ugovorima...
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id}>
                  <div
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>

                  {/* Confirmation card for pending write actions */}
                  {msg.pending_action && (
                    <div className="mt-2 ml-0 max-w-[85%] rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
                        Akcija zahtijeva vašu potvrdu
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleConfirm(msg.id, true)}
                          disabled={loading}
                          className="h-7 text-xs"
                        >
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Potvrdi
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfirm(msg.id, false)}
                          disabled={loading}
                          className="h-7 text-xs"
                        >
                          <XCircle className="mr-1 h-3 w-3" />
                          Odbij
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Razmišljam...
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="border-t px-4 py-3">
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Postavite pitanje..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              aria-label="Pošalji poruku"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
