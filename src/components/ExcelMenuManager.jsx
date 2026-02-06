// ExcelMenuManager.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";

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
  const [items, setItems] = useState([]); // menu items
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const fileInputRef = useRef();
  const { send: socketSend } = useMenuSocket({
    wsUrl,
    token,
    onMessage: (msg) => {
      // If server broadcasts full menu or item updates, merge them
      if (msg?.type === "menu:update" && msg.payload) {
        // simple handling: if payload is fullMenu array, replace; if object, upsert
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

  useEffect(() => {
  fetchMenu();
}, [fetchMenu]);


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

  // Inline create/update
  async function saveItem(item, isNew = false) {
    // validation
    if (!item.name || item.price == null) {
      setErrors(["Name and Price are required"]);
      return;
    }
    setErrors([]);
    // optimistic update
    if (isNew) setItems(prev => [item, ...prev]);
    else setItems(prev => prev.map(p => (p.id === item.id ? item : p)));

    try {
      // if there's an imageFile property, do multipart/form-data
      if (item.imageFile) {
        const fd = new FormData();
        fd.append("name", item.name);
        fd.append("price", item.price);
        fd.append("category", item.category || "");
        fd.append("available", item.available ? "true" : "false");
        fd.append("description", item.description || "");
        fd.append("prepTimeMin", item.prepTimeMin || 0);
        fd.append("tags", Array.isArray(item.tags) ? item.tags.join(",") : (item.tags || ""));
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

        // replace optimistic with server result
        setItems(prev => {
          if (isNew) {
            return prev.map(p => (p === item ? saved : p));
          }
          return prev.map(p => (p.id === saved.id ? saved : p));
        });

        // notify server to broadcast (server may broadcast after persistence too)
        socketSend && socketSend({ type: "menu:update", payload: saved });
      } else {
        // no image, just JSON
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
        setItems(prev => prev.map(p => (p.id === (item.id || saved.id) ? saved : p)));
        socketSend && socketSend({ type: "menu:update", payload: saved });
      }
    } catch (err) {
      console.error(err);
      setErrors([err.message || "Save failed"]);
      // rollback (simplest: refetch)
      fetchMenu();
    }
  }

  async function deleteItem(id) {
    const confirm = window.confirm("Delete this item?");
    if (!confirm) return;
    // optimistic remove
    const backup = items;
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Delete failed");
      socketSend && socketSend({ type: "menu:update", payload: { id, deleted: true }});
    } catch (err) {
      console.error(err);
      setItems(backup);
      setErrors([err.message || "Delete failed"]);
    }
  }

  // Excel upload
  function handleExcelFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const arr = new Uint8Array(ev.target.result);
      const wb = XLSX.read(arr, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      // normalize to our item shape
      const parsed = json.map((r, idx) => ({
        id: r.id || null,
        name: (r.name || r.Name || "").toString(),
        category: (r.category || r.Category || ""),
        price: Number(r.price || r.Price || 0),
        available: String(r.available || r.Available || "true").toLowerCase() !== "false",
        description: r.description || r.Description || "",
        prepTimeMin: Number(r.prepTimeMin || r.PrepTimeMin || 0),
        tags: (r.tags || r.Tags || "").toString().split(/[;,|]/).map(t => t.trim()).filter(Boolean)
      }));
      // show preview by setting local rows
      setItems(parsed);
    };
    reader.readAsArrayBuffer(file);
  }

  // Bulk upload JSON to backend
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
      // assume server returns full menu
      setItems(Array.isArray(saved) ? saved : items);
      socketSend && socketSend({ type: "menu:update", payload: Array.isArray(saved) ? saved : items });
      alert("Bulk upload completed");
    } catch (err) {
      console.error(err);
      setErrors([err.message || "Bulk upload failed"]);
    } finally {
      setLoading(false);
    }
  }

  // UI small helper to edit a single field
  const updateField = (idx, key, value) => {
    setItems(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: value };
      return copy;
    });
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h2>Vendor Menu Manager</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => {
          // create downloadable template
          const header = [["name","category","price","available","description","prepTimeMin","tags"]];
          const sample = [["Idli","Breakfast",30,true,"Soft idli",5,"veg"]];
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.aoa_to_sheet([...header, ...sample]);
          XLSX.utils.book_append_sheet(wb, ws, "template");
          XLSX.writeFile(wb, "menu-template.xlsx");
        }}>Download Template</button>

        <label style={{ border: "1px dashed #aaa", padding: "6px 10px", cursor: "pointer" }}>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelFile} style={{ display: "none" }} />
          Upload Excel
        </label>

        <button onClick={handleBulkUpload} disabled={loading}>Upload Previewed Menu</button>

        <div style={{ marginLeft: "auto" }}>
          <button onClick={fetchMenu}>Refresh</button>
        </div>
      </div>

      {errors.length > 0 && (
        <div style={{ color: "darkred" }}>
          {errors.map((e,i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f3f3f3" }}>
              <th>#</th><th>Name</th><th>Category</th><th>Price</th><th>Available</th><th>PrepMin</th><th>Tags</th><th>Image</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id || idx}>
                <td>{idx+1}</td>
                <td><input value={it.name||""} onChange={e => updateField(idx, "name", e.target.value)} /></td>
                <td><input value={it.category||""} onChange={e => updateField(idx, "category", e.target.value)} /></td>
                <td><input type="number" value={it.price||0} onChange={e => updateField(idx, "price", Number(e.target.value))} /></td>
                <td><input type="checkbox" checked={!!it.available} onChange={e => updateField(idx, "available", e.target.checked)} /></td>
                <td><input type="number" value={it.prepTimeMin||0} onChange={e => updateField(idx, "prepTimeMin", Number(e.target.value))} /></td>
                <td><input value={(it.tags||[]).join(", ")} onChange={e => updateField(idx, "tags", e.target.value.split(",").map(s=>s.trim()))} /></td>
                <td>
                  <input type="file" accept="image/*" onChange={e => updateField(idx, "imageFile", e.target.files?.[0])} />
                  {it.imageUrl && <div style={{ marginTop: 6 }}><img src={it.imageUrl} alt="" style={{ width: 60, height: 40, objectFit: "cover" }} /></div>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button onClick={() => saveItem(it, !it.id)}>Save</button>
                  {it.id && <button onClick={() => deleteItem(it.id)} style={{ marginLeft: 6 }}>Delete</button>}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 12 }}>No items. Upload Excel or add rows.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={() => setItems(prev => [{ name: "", category: "", price: 0, available: true, description: "", prepTimeMin: 0, tags: [] }, ...prev])}>
          Add Empty Row
        </button>
      </div>
    </div>
  );
}
