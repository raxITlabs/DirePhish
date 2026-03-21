"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Send } from "lucide-react";
import { chatWithReport } from "@/app/actions/report";
import ChatMessageComponent from "./ChatMessage";
import type { ChatMessage } from "@/app/types";

interface ReportChatProps {
  simulationId: string;
  reportId: string;
}

export default function ReportChat({
  simulationId,
}: ReportChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setLoading(true);

    try {
      const result = await chatWithReport(simulationId, text, messages);
      if ("data" in result) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.data.response,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMessage: ChatMessage = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Ask questions about the report...
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessageComponent key={i} message={msg} />
        ))}
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 p-4 border-t border-border"
      >
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask about this report..."
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !inputText.trim()}>
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}
