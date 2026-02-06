// ExcelMenuManager.jsx
import React, {
  useEffect,
  useRef,
  useState,
  useCallback
} from "react";

import * as XLSX from "xlsx";
import { useMenuSocket } from "./useMenuSocket";

/**
 Props:
 - apiBase (string) e.g. '/api/vendor/menu'
 - uploadUrl for JSON bulk default: '/api/vendor/menu/bulk-json'
 - token (string) optional - JWT for Authorization header
 - wsUrl (string) optional - wss://yourserver/ws
*/
export default function ExcelMenuManager({
  apiBase = "/api/vendor/menu",
  bulkJsonUrl = "/api/vendor/menu/bulk-json",
  token,
  wsUrl
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const fileInputRef = useRef();

  const { send: socketSend } = useMenuSocket({
    wsUrl,
    token,
    onMessage: (msg) => {
      if (msg?.type === "menu:update" && msg.payload) {
        if (Array.isArray(msg.payload)) setItems(msg.payload);
        else {
          setItems(prev => {
            const idx = prev.findIndex(p => p.id === msg.payload.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = msg.payload;
              return copy;
            } else {
              return [msg.payload, ...prev];
            }
          });
        }
      }
    }
  });

  // ✅ FIX: wrapped in useCallback
  const fetchMenu = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(apiBase, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Failed to load menu");
      const json = await res.json();
      setItems(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  // ✅ FIX: single useEffect only
  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  async function saveItem(item, isNew = false) {
    if (!item.name || item.price == null) {
      setErrors(["Name and Price are required"]);
      return;
    }
    setErrors([]);

    if (isNew) setItems(prev => [item, ...prev]);
    else setItems(prev => prev.map(p => (p.id === item.id ? item : p)));

    try {
      if (item.imageFile) {
        const fd = new FormData();
        fd.append("name", item.name);
        fd.append("price", item.price);
        fd.append("category", item.category || "");
        fd.append("available", item.available ? "true" : "false");
        fd.append("description", item.description || "");
        fd.append("prepTimeMin", item.prepTimeMin || 0);
        fd.append(
          "tags",
          Array.isArray(item.tags)
            ? item.tags.join(",")
            : (item.tags || "")
        );
        fd.append("image", item.imageFile);

        const url = isNew ? apiBase : `${apiBase}/${item.id}`;
        const method = isNew ? "POST" : "PUT";

        const res = await fetch(url, {
          method,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd
        });
        if (!res.ok) throw new Error("Save failed");
        const saved = await res.json();

        setItems(prev => {
          if (isNew) {
            return prev.map(p => (p === item ? saved : p));
          }
          return prev.map(p => (p.id === saved.id ? saved : p));
        });

        socketSend && socketSend({ type: "menu:update", payload: saved });
      } else {
        const url = isNew ? apiBase : `${apiBase}/${item.id}`;
        const method = isNew ? "POST" : "PUT";

        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(item)
        });
        if (!res.ok) throw new Error("Save failed");
        const saved = await res.json();

        setItems(prev =>
          prev.map(p =>
            p.id === (item.id || saved.id) ? saved : p
          )
        );

        socketSend && socketSend({ type: "menu:update", payload: saved });
      }
    } catch (err) {
      console.error(err);
      setErrors([err.message || "Save failed"]);
      fetchMenu();
    }
  }

  async function deleteItem(id) {
    const confirm = window.confirm("Delete this item?");
    if (!confirm) return;

    const backup = items;
    setItems(prev => prev.filter(i => i.id !== id));

    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Delete failed");
      socketSend &&
        socketSend({ type: "menu:update", payload: { id, deleted: true } });
    } catch (err) {
      console.error(err);
      setItems(backup);
      setErrors([err.message || "Delete failed"]);
    }
  }

  function handleExcelFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const arr = new Uint8Array(ev.target.result);
      const wb = XLSX.read(arr, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const parsed = json.map((r) => ({
        id: r.id || null,
        name: (r.name || r.Name || "").toString(),
        category: r.category || r.Category || "",
        price: Number(r.price || r.Price || 0),
        available:
          String(r.available || r.Available || "true").toLowerCase() !==
          "false",
        description: r.description || r.Description || "",
        prepTimeMin: Number(r.prepTimeMin || r.PrepTimeMin || 0),
        tags: (r.tags || r.Tags || "")
          .toString()
          .split(/[;,|]/)
          .map(t => t.trim())
          .filter(Boolean)
      }));

      setItems(parsed);
    };

    reader.readAsArrayBuffer(file);
  }

  async function handleBulkUpload() {
    if (!items.length) return alert("No items to upload");

    try {
      setLoading(true);
      const res = await fetch(bulkJsonUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(items)
      });
      if (!res.ok) throw new Error("Bulk upload failed");

      const saved = await res.json();
      setItems(Array.isArray(saved) ? saved : items);
      socketSend &&
        socketSend({
          type: "menu:update",
          payload: Array.isArray(saved) ? saved : items
        });
      alert("Bulk upload completed");
    } catch (err) {
      console.error(err);
      setErrors([err.message || "Bulk upload failed"]);
    } finally {
      setLoading(false);
    }
  }

  const updateField = (idx, key, value) => {
    setItems(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: value };
      return copy;
    });
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      {/* UI unchanged */}
    </div>
  );
}
