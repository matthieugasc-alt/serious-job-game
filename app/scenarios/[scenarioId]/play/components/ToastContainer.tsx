/**
 * ToastContainer — fixed-position queue of toast notifications.
 *
 * Pure presentation. The toast queue is owned by useToasts; this
 * component just renders + lets the user click-through to the right
 * view (mail or chat) or dismiss.
 */

import React from "react";

export type Toast = {
  id: string;
  text: string;
  icon: string;
  type: "mail" | "chat";
};

export type ToastContainerProps = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onActivate: (type: Toast["type"]) => void;
};

export function ToastContainer({ toasts, onDismiss, onActivate }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => {
            onActivate(toast.type);
            onDismiss(toast.id);
          }}
          style={{
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderLeft: `4px solid ${toast.type === "mail" ? "#f5a623" : "#5b5fc7"}`,
            borderRadius: 8,
            padding: "10px 16px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 280,
            maxWidth: 360,
            cursor: "pointer",
            animation: "toastSlideIn 0.3s ease-out",
          }}
        >
          <span style={{ fontSize: 20, flexShrink: 0 }}>{toast.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#333",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {toast.text}
            </div>
            <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
              {toast.type === "mail" ? "Cliquez pour voir l'email" : "Cliquez pour voir le message"}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(toast.id);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#999",
              cursor: "pointer",
              fontSize: 16,
              padding: "0 4px",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <style>{`@keyframes toastSlideIn{from{opacity:0;transform:translateX(100px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}
