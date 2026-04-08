import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bot, ChevronDown, ChevronUp, Send, Bookmark, Trash2, Sparkles, Copy, Check, Paperclip, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  isUploading?: boolean;
}

interface Memory {
  id: string;
  memory_text: string;
  created_at: string;
}

const SUGGESTIONS = [
  "What is my most profitable SKU?",
  "How much did I spend last month?",
  "Which machine is performing best?",
  "What should I restock soon?",
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chip-chat`;

export default function Chat() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyToClipboard = (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg || msg.role !== "assistant") return;
    let question = "";
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") { question = messages[i].content; break; }
    }
    const text = question ? `Q: ${question}\n\nA: ${msg.content}` : msg.content;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(msgIndex);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  useEffect(() => {
    if (!user) return;
    supabase
      .from("chip_memories")
      .select("id, memory_text, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMemories(data);
      });
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamChatResponse = useCallback(async (
    chatMessages: Message[],
    extraPayload?: Record<string, any>
  ) => {
    if (!session) return;
    setIsLoading(true);
    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: chatMessages.filter(m => !m.isUploading).map(({ role, content }) => ({ role, content })),
          ...extraPayload,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      if (!assistantSoFar) {
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
    }
  }, [session, toast]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !session) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    await streamChatResponse(allMessages);
  }, [messages, isLoading, session, streamChatResponse]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!user || !session || isLoading || isUploading) return;

    setIsUploading(true);
    const uploadMsg: Message = { role: "user", content: `📎 Uploading receipt: ${file.name}...`, isUploading: true };
    setMessages(prev => [...prev, uploadMsg]);

    try {
      // 1. Upload file to storage
      const timestamp = Date.now();
      const filePath = `${user.id}/${timestamp}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // 2. Create receipt row
      const today = new Date().toISOString().split("T")[0];
      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .insert({
          user_id: user.id,
          pdf_url: filePath,
          receipt_date: today,
          vendor: "sams" as const,
          parse_status: "PENDING" as const,
        })
        .select()
        .single();

      if (receiptError || !receipt) throw new Error("Failed to create receipt record");

      // 3. Call parse-receipt
      const parseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`;
      await fetch(parseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ receipt_id: receipt.id, file_path: filePath, model_override: "google/gemini-2.5-flash" }),
      });

      // Update upload message
      setMessages(prev => prev.map(m =>
        m.isUploading ? { ...m, content: `📎 Parsing receipt: ${file.name}...` } : m
      ));

      // 4. Poll for completion
      let parsedReceipt: any = null;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const { data } = await supabase
          .from("receipts")
          .select("*")
          .eq("id", receipt.id)
          .single();

        if (data && data.parse_status !== "PENDING") {
          parsedReceipt = data;
          break;
        }
      }

      if (!parsedReceipt) throw new Error("Parsing timed out. Check the Receipts tab for status.");

      if (parsedReceipt.parse_status === "FAILED") {
        // Replace upload message with final user message, add error
        setMessages(prev => [
          ...prev.filter(m => !m.isUploading),
          { role: "user", content: `📎 Uploaded: ${file.name}` },
          { role: "assistant", content: "I couldn't read that receipt. Try a clearer photo or PDF, and make sure it's a Sam's Club or Walmart receipt." },
        ]);
        return;
      }

      // 5. Duplicate check — look for same store + date + total
      if (parsedReceipt.total && parsedReceipt.receipt_date) {
        const { data: dupes } = await supabase
          .from("receipts")
          .select("id")
          .eq("user_id", user.id)
          .eq("receipt_date", parsedReceipt.receipt_date)
          .eq("total", parsedReceipt.total)
          .neq("id", receipt.id);

        if (dupes && dupes.length > 0) {
          // Delete the duplicate
          await supabase.from("receipt_items").delete().eq("receipt_id", receipt.id);
          await supabase.from("receipts").delete().eq("id", receipt.id);
          await supabase.storage.from("receipts").remove([filePath]);

          setMessages(prev => [
            ...prev.filter(m => !m.isUploading),
            { role: "user", content: `📎 Uploaded: ${file.name}` },
            { role: "assistant", content: "This receipt appears to already be uploaded. I found an existing receipt with the same date and total." },
          ]);
          return;
        }
      }

      // 6. Fetch parsed items with SKU data
      const { data: items } = await supabase
        .from("receipt_items")
        .select("raw_name, qty, pack_size, line_total, unit_cost, sku_id, is_personal")
        .eq("receipt_id", receipt.id);

      // Get sell prices for matched SKUs
      const skuIds = (items || []).filter(i => i.sku_id).map(i => i.sku_id!);
      let skuPrices: Record<string, number> = {};
      if (skuIds.length > 0) {
        const { data: skus } = await supabase
          .from("skus")
          .select("id, sell_price")
          .in("id", skuIds);
        if (skus) {
          for (const s of skus) {
            if (s.sell_price) skuPrices[s.id] = Number(s.sell_price);
          }
        }
      }

      const receiptItems = (items || []).map(i => ({
        name: i.raw_name,
        qty: i.qty,
        pack_size: i.pack_size,
        line_total: i.line_total,
        unit_cost: i.unit_cost ? Number(i.unit_cost) : null,
        sell_price: i.sku_id ? skuPrices[i.sku_id] ?? null : null,
        sku_id: i.sku_id,
      }));

      const receiptContext = {
        receipt_id: receipt.id,
        store_name: parsedReceipt.store_location || "Unknown Store",
        receipt_date: parsedReceipt.receipt_date,
        total: parsedReceipt.total,
        item_count: parsedReceipt.item_count || items?.length || 0,
        items: receiptItems,
      };

      // Replace upload message with final user message
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isUploading);
        return [...filtered, { role: "user", content: `📎 Receipt uploaded: ${parsedReceipt.store_location || file.name} — ${parsedReceipt.receipt_date}` }];
      });

      // 7. Send to chip-chat for trip summary
      const currentMessages = messages.filter(m => !m.isUploading);
      const summaryMessages: Message[] = [
        ...currentMessages,
        { role: "user", content: `I just uploaded a receipt from ${parsedReceipt.store_location || "a store"} dated ${parsedReceipt.receipt_date}. Give me a trip summary.` },
      ];

      await streamChatResponse(summaryMessages, { receipt_context: receiptContext });

    } catch (e: any) {
      toast({ title: "Upload Error", description: e.message, variant: "destructive" });
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isUploading);
        return [...filtered, { role: "assistant", content: `Failed to process receipt: ${e.message}` }];
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [user, session, isLoading, isUploading, messages, streamChatResponse, toast]);

  const saveMemory = async (text: string) => {
    if (!user) return;
    const { data, error } = await supabase.from("chip_memories").insert({
      user_id: user.id,
      memory_text: text,
    }).select("id, memory_text, created_at").single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setMemories((prev) => [data, ...prev]);
      toast({ title: "Saved!", description: "Insight saved to Chip's Memory." });
    }
  };

  const deleteMemory = async (id: string) => {
    await supabase.from("chip_memories").delete().eq("id", id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-7.5rem)]">
      {/* Scrollable area: header + memory + chat */}
      <div className="flex-1 overflow-y-auto scroll-touch">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Chip</h1>
              <p className="text-xs text-muted-foreground">Your vending business assistant</p>
            </div>
          </div>

          {/* Chip's Memory */}
          <Collapsible open={memoryOpen} onOpenChange={setMemoryOpen}>
            <CollapsibleTrigger asChild>
              <Card className="border-0 shadow-sm cursor-pointer">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Chip's Memory</span>
                    {memories.length > 0 && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{memories.length}</span>
                    )}
                  </div>
                  {memoryOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </CardContent>
              </Card>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="border-0 shadow-sm mt-1">
                <CardContent className="p-3 space-y-2 max-h-40 overflow-y-auto">
                  {memories.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No saved memories yet. Save insights from Chip's responses!</p>
                  ) : (
                    memories.map((m) => (
                      <div key={m.id} className="flex items-start gap-2 text-xs">
                        <p className="flex-1 text-muted-foreground">{m.memory_text.slice(0, 150)}{m.memory_text.length > 150 ? "…" : ""}</p>
                        <button onClick={() => deleteMemory(m.id)} className="text-destructive hover:text-destructive/80 mt-0.5 shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Chat messages */}
        <div className="px-4 py-2 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 pb-8">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10">
                <Bot className="h-9 w-9 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Ask me anything about your vending business — profits, costs, trends, restocking advice, and more.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-xs p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="flex items-start pt-1 shrink-0">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    </div>
                  )}
                  <div>
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-card border rounded-bl-md"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : msg.isUploading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {msg.content}
                        </span>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === "assistant" && !isLoading && (
                      <div className="flex items-center gap-3 mt-1 ml-1">
                        <button
                          onClick={() => copyToClipboard(i)}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                        >
                          {copiedIndex === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedIndex === i ? "Copied!" : "Copy"}
                        </button>
                        <button
                          onClick={() => saveMemory(msg.content)}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Bookmark className="h-3 w-3" /> Save to Memory
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="flex gap-2 items-start">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="rounded-2xl rounded-bl-md bg-card border px-3.5 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileUpload(f);
        }}
      />

      {/* Input — always visible */}
      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 border-t bg-background">
        <div className="flex gap-2 items-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={isLoading || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Chip anything..."
            disabled={isLoading || isUploading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || isUploading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
