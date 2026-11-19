import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Database } from "lucide-react";
import { GoogleGenAI, Type, Content, Part, FunctionDeclaration } from "@google/genai";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const search5eToolsDb: FunctionDeclaration = {
  name: "search5eToolsDb",
  description: "Search the 5eTools database to find 5e resources (monsters, spells, items, rules, classes). You must use this instead of guessing.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: "Must be one of: 'monsters', 'spells', 'items'.",
      },
      query: {
        type: Type.STRING,
        description: "The name of the entity to search for. E.g. 'Bloodwell Vial', 'Fireball'.",
      }
    },
    required: ["query"]
  }
};

interface Message {
  role: "user" | "model" | "system";
  text: string;
}

export function ChatBox() {
  const [edition, setEdition] = useState<"2014" | "2024">("2014");
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<Content[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setIsLoading(true);

    let currentHistory = [...history];
    currentHistory.push({ role: "user", parts: [{ text: userMsg }] });

    let done = false;
    let passes = 0;

    try {
      while (!done && passes < 3) {
        passes++;
        
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: currentHistory,
          config: {
            systemInstruction: `You are a helpful and precise D&D 5e assistant using the ${edition} ruleset. Try to use the \`search5eToolsDb\` function to look up exact details for spells, monsters, items, or rules before giving an answer. This includes non-SRD content like Tasha's Cauldron. If you can only find the requested entity in a source from a different edition (e.g. searching 2014 but it's only in XPHB [2024], or searching 2024 but it's only in PHB [2014]), you MUST inform the user which edition it belongs to, rather than just returning it as normal or giving up. DO NOT loop searches infinitely. Format nicely with Markdown.`,
            tools: [{ functionDeclarations: [search5eToolsDb] }]
          }
        });

        const responseContent = response.candidates?.[0]?.content;
        if (!responseContent) break;

        currentHistory.push(responseContent);

        if (response.functionCalls && response.functionCalls.length > 0) {
          const fnParts: Part[] = [];
          
          for (const call of response.functionCalls) {
            if (call.name === "search5eToolsDb") {
              const { category, query } = call.args as any;
              
              setMessages((prev) => [...prev, { 
                role: "system", 
                text: `Searching 5eTools for ${category || 'all'}: "${query}"...` 
              }]);

              try {
                let url = `/api/search?q=${encodeURIComponent(query)}&edition=${edition}`;
                if (category) url += `&type=${encodeURIComponent(category)}`;

                const res = await fetch(url);
                const data = await res.json();
                
                // Trim the response somewhat but keep important details
                const trimmedResults = (data.results || []).map((r: any) => {
                  const safeObj: any = { name: r.name, source: r.source };
                  ['desc', 'ac', 'hp', 'speed', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'action', 'reaction', 'trait', 'legendary', 'entries', 'wondrous', 'rarity', 'type', 'bonusSpellAttack', 'bonusSpellSaveDc', 'duration', 'level', 'school', 'classes'].forEach(k => {
                    if (r[k] !== undefined) safeObj[k] = r[k];
                  });
                  return safeObj;
                });

                fnParts.push({
                  functionResponse: {
                    name: call.name,
                    response: {
                      results: trimmedResults
                    }
                  }
                });
              } catch (err) {
                fnParts.push({
                  functionResponse: {
                    name: call.name,
                    response: { error: String(err) }
                  }
                });
              }
            }
          }
          
          currentHistory.push({ role: "user", parts: fnParts });
        } else {
          done = true;
          setMessages((prev) => [...prev, { role: "model", text: response.text || "" }]);
        }
      }
      if (!done) {
        // Force a response without tools after multiple searches failed
        const finalFallback = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: currentHistory,
          config: {
            systemInstruction: "You are a helpful and precise D&D 5e assistant. The search limits were exhausted. Answer the user's question directly with your own knowledge.",
          }
        });
        const responseText = finalFallback.text;
        if (responseText) {
          setMessages((prev) => [...prev, { role: "model", text: responseText }]);
          currentHistory.push({ role: "model", parts: [{ text: responseText }] });
        } else {
          setMessages((prev) => [...prev, { role: "system", text: "Search limit reached. The AI was unable to form a complete response." }]);
        }
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      setMessages((prev) => [...prev, { role: "system", text: "Error: Could not get response." }]);
    } finally {
      setIsLoading(false);
      setHistory(currentHistory);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-full shadow-2xl transition-all z-50 flex items-center justify-center border border-indigo-400 group"
      >
        <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 sm:w-96 bg-slate-900 border border-indigo-500/50 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden backdrop-blur-xl">
      <div className="bg-slate-800/80 border-b border-white/5 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-200">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={edition} 
            onChange={(e) => setEdition(e.target.value as "2014" | "2024")}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1 outline-none"
          >
            <option value="2014">2014 Rules</option>
            <option value="2024">2024 Rules</option>
          </select>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 max-h-[500px] min-h-64 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 text-xs mt-8 flex flex-col items-center gap-2">
            <Database className="w-8 h-8 opacity-20 mb-2" />
            <div className="font-bold">Powered by 5eTools Database</div>
            <div className="italic">Ask me D&D rules, spells, or monster stats!</div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : msg.role === "system" ? "justify-center" : "justify-start"}`}>
              {msg.role === "system" ? (
                <div className="bg-indigo-500/10 text-indigo-300 text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full border border-indigo-500/20 flex items-center gap-2">
                  <Database className="w-3 h-3 animate-pulse" />
                  {msg.text}
                </div>
              ) : (
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user" 
                      ? "bg-indigo-600 text-white rounded-tr-sm" 
                      : "bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50 text-wrap break-words prose prose-invert prose-sm prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mb-1 [&_p]:mb-2 last:[&_p]:mb-0 [&_strong]:text-slate-100 prose-table:border-collapse prose-table:w-full prose-th:border prose-th:border-slate-600 prose-th:p-2 prose-th:bg-slate-900 prose-td:border prose-td:border-slate-700 prose-td:p-2 overflow-x-auto"
                  }`}
                >
                  {msg.role === "user" ? (
                    msg.text
                  ) : (
                    <div className="flex flex-col gap-1 w-full overflow-hidden">
                      <Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-slate-400 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 border border-slate-700/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="p-3 border-t border-white/5 bg-slate-800/50">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-4 pr-10 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-500 hover:bg-indigo-400 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-indigo-500"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
