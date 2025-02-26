"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./chat.module.css";
import Markdown from "react-markdown";

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

type ChatProps = {};

const Chat = ({}: ChatProps) => {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<MessageProps[]>([
    {
      role: "assistant",
      text: "I am a Plantz Agent who can talk about medical cannabis, clinics and prescriptions. How can I help you?",
    },
  ]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [threadId, setThreadId] = useState("");

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
    setInputDisabled(true); // Disable input while sending
    try {
      const response = await fetch(`/api/assistants/threads/${threadId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: text }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! Status: ${response.status}`;
        try {
          const errorText = await response.text();
          errorMessage += ` - ${errorText}`;
        } catch (e) {
          console.warn("Failed to read error text from response", e);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("Response data:", data);

      if (data.content) {
        setMessages((prevMessages) => [
          ...prevMessages,
          { role: "assistant", text: data.content },
        ]);
      } else {
        console.warn("No content received in response.");
      }

    } catch (error: any) {
      console.error("Error processing response:", error);
      setMessages((prevMessages) => [
        ...prevMessages,
        { role: "assistant", text: `Error: ${error.message}` },
      ]);
    } finally {
      setInputDisabled(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    setMessages((prevMessages) => [...prevMessages, { role: "user", text: userInput }]);

    sendMessage(userInput);
    setUserInput("");
    scrollToBottom();
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