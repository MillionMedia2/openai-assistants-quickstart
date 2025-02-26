"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./chat.module.css";
import { AssistantStream } from "openai/lib/AssistantStream";
import Markdown from "react-markdown";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";

type MessageProps = {
  role: "user" | "assistant" | "code";
  text: string;
};

const UserMessage = ({ text }: { text: string }) => {
  return <div className={styles.userMessage}>{text}</div>;
};

const AssistantMessage = ({ text }: { text: string }) => {
  return (
    <div className={styles.assistantMessage}>
      <Markdown>{text}</Markdown>
    </div>
  );
};

const CodeMessage = ({ text }: { text: string }) => {
  return (
    <div className={styles.codeMessage}>
      {text.split("\n").map((line, index) => (
        <div key={index}>
          <span>{`${index + 1}. `}</span>
          {line}
        </div>
      ))}
    </div>
  );
};

const Message = ({ role, text }: MessageProps) => {
  switch (role) {
    case "user":
      return <UserMessage text={text} />;
    case "assistant":
      return <AssistantMessage text={text} />;
    case "code":
      return <CodeMessage text={text} />;
    default:
      return null;
  }
};

type ChatProps = {
  functionCallHandler?: (
    toolCall: RequiredActionFunctionToolCall
  ) => Promise<string>;
};

const Chat = ({
  functionCallHandler = () => Promise.resolve(""), // default to return empty string
}: ChatProps) => {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<MessageProps[]>([
    {
      role: "assistant",
      text: "I am a Plantz Agent who can talk about medical cannabis, clinics and prescriptions. How can I help you?",
    },
  ]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [threadId, setThreadId] = useState("");
  const [lastActivity, setLastActivity] = useState(Date.now()); // Track last stream activity
  const HEARTBEAT_INTERVAL = 5000; // 5 seconds

  // automatically scroll to bottom of chat
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // create a new threadID when chat component created
  useEffect(() => {
    const createThread = async () => {
      try {
        const res = await fetch(`/api/assistants/threads`, {
          method: "POST",
        });
        if (!res.ok) {
          throw new Error(`Failed to create thread: ${res.status}`);
        }
        const data = await res.json();
        setThreadId(data.threadId);
      } catch (error: any) {
        console.error("Error creating thread:", error);
      }
    };
    createThread();
  }, []);

  const sendMessage = async (text) => {
    try {
      const response = await fetch(
        `/api/assistants/threads/${threadId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: text,
          }),
        }
      );
      if (!response.ok) {
        // Try to read the error message from the response
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorText = await response.text();
          errorMessage += ` - ${errorText}`;
        } catch (e) {
          console.warn("Failed to read error text from response", e);
        }
        throw new Error(errorMessage);
      }
      const stream = AssistantStream.fromReadableStream(response.body);
      handleReadableStream(stream);
    } catch (error: any) {
      console.error("Error sending message:", error);
      setInputDisabled(false);
    }
  };

  const submitActionResult = async (runId, toolCallOutputs) => {
    try {
      const response = await fetch(
        `/api/assistants/threads/${threadId}/actions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId: runId,
            toolCallOutputs: toolCallOutputs,
          }),
        }
      );
      const stream = AssistantStream.fromReadableStream(response.body);
      handleReadableStream(stream);
    } catch (error: any) {
      console.error("Error submitting action result:", error);
      setInputDisabled(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    sendMessage(userInput);
    setMessages((prevMessages) => [
      ...prevMessages,
      { role: "user", text: userInput },
    ]);
    setUserInput("");
    setInputDisabled(true);
    scrollToBottom();
  };

  /* Stream Event Handlers */

  // textCreated - create new assistant message
  const handleTextCreated = () => {
    appendMessage("assistant", "");
    setLastActivity(Date.now());
  };

  // textDelta - append text to last assistant message
  const handleTextDelta = (delta) => {
    if (delta.value != null) {
      appendToLastMessage(delta.value);
        setLastActivity(Date.now());
    };
    if (delta.annotations != null) {
      annotateLastMessage(delta.annotations);
    }
  };

  // handleRequiresAction - handle function call
  const handleRequiresAction = async (
    event: any //ASSISTANTSTREAMEVENT.THREADRUNREQUIRESACTION
  ) => {
    const runId = event.data.id;
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    // loop over tool calls and call function handler
    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const result = await functionCallHandler(toolCall);
        return { output: result, tool_call_id: toolCall.id };
      })
    );
    setInputDisabled(true);
    submitActionResult(runId, toolCallOutputs);
  };

  // handleRunCompleted - re-enable the input form
  const handleRunCompleted = () => {
    setInputDisabled(false);
  };

   const handleReadableStream = (stream: AssistantStream) => {
    try {
      let streamActive = true; // Track if the stream is considered active
      const resetInactivityTimeout = () => {
        setLastActivity(Date.now()); // Reset last activity on any event
      };
      // Heartbeat Mechanism (Client-Side)
      const inactivityCheck = () => {
        if (Date.now() - lastActivity > HEARTBEAT_INTERVAL * 2 && streamActive) { // Check if no activity for 2 intervals
          console.error("Heartbeat failed: Stream appears to be inactive.");
          streamActive = false; // Mark stream as inactive
          setInputDisabled(false); // Re-enable input
        }
      };
      const heartbeatIntervalId = setInterval(inactivityCheck, HEARTBEAT_INTERVAL);

      // messages
      stream.on("textCreated", (event) => {
        try {
          handleTextCreated();
          resetInactivityTimeout();
        } catch (error) {
          console.error("Error in handleTextCreated:", error);
          streamActive = false;
        }
      });
      stream.on("textDelta", (event) => {
        try {
          handleTextDelta(event);
          resetInactivityTimeout();
        } catch (error) {
          console.error("Error in handleTextDelta:", error);
          streamActive = false;
        }
      });

      stream.on("event", (event) => {
        try {
          if (event.event === "thread.run.requires_action") {
            handleRequiresAction(event);
          }
          if (event.event === "thread.run.completed") {
            handleRunCompleted();
            clearInterval(heartbeatIntervalId);
          }
          resetInactivityTimeout();
        } catch (error) {
          console.error("Error in event handler:", error);
          streamActive = false;
        }
      });

      stream.on("error", (error) => {
        console.error("Stream error:", error);
        setInputDisabled(false);
        clearInterval(heartbeatIntervalId); // Clear interval on error
        streamActive = false;
      });

      stream.on("end", () => {
        console.log("Stream ended");
        clearInterval(heartbeatIntervalId); // Clear interval on end
      });

    } catch (error) {
      console.error("Error setting up handleReadableStream", error);
    }
  };

  /*
    =======================
    === Utility Helpers ===
    =======================
  */

  const appendToLastMessage = (text) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      const updatedLastMessage = {
        ...lastMessage,
        text: lastMessage.text + text,
      };
      return [...prevMessages.slice(0, -1), updatedLastMessage];
    });
  };

  const appendMessage = (role, text) => {
    setMessages((prevMessages) => [...prevMessages, { role, text }]);
  };

  const annotateLastMessage = (annotations) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      const updatedLastMessage = {
        ...lastMessage,
      };
      annotations.forEach((annotation) => {
        if (annotation.type === 'file_path') {
          updatedLastMessage.text = updatedLastMessage.text.replaceAll(
            annotation.text,
            `/api/files/${annotation.file_path.file_id}`
          );
        }
      })
      return [...prevMessages.slice(0, -1), updatedLastMessage];
    });
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages}>
        {messages.map((msg, index) => (
          <Message key={index} role={msg.role} text={msg.text} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className={`${styles.inputForm} ${styles.clearfix}`}
      >
        <input
          type="text"
          className={styles.input}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Enter your question"
        />
        <button
          type="submit"
          className={styles.button}
          disabled={inputDisabled}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;