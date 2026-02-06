import React, { useEffect, useState } from "react";
import "./Orders.css";
import { useNavigate } from "react-router-dom";

/* 🔒 MENU PRICE MAP (UNCHANGED) */
const MENU_PRICES = {
  "Veg Thali": 120,
  "Matar Paneer": 150,
  Burger: 80,
  Pizza: 200,
  Chinese: 140,
  Chaats: 60,
  "Veg Pulao": 80,
  "Veg Fried Rice": 90,
  "Paneer Rice": 110,
  "Jeera Rice": 70,
};

const CANCEL_REASONS = [
  "Ordered by mistake",
  "Wait time too long",
  "Changed my mind",
  "Found a better option",
  "Other",
];

const getPrice = (name) => MENU_PRICES[name] || 0;



const Orders = () => {
  const [tab, setTab] = useState("past");
  const [orders, setOrders] = useState([]);
  const [supportChats, setSupportChats] = useState({});

  /* 🔥 NEW STATES (ADDED ONLY) */
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const navigate = useNavigate();

  /* 🔁 LOAD ORDERS (UNCHANGED SOURCE) */
  useEffect(() => {
    const loadOrders = () => {
      const monitorOrders =
        JSON.parse(localStorage.getItem("monitorOrders")) || [];

      setOrders(
        monitorOrders.map((o) => ({
          id: o.id,
          rawStatus: o.status,
          restaurant: o.canteen || "N/A",
          date: o.date || new Date().toLocaleDateString(),
          dateTime: o.time,
          items: o.items,
          amount:
            Number(
              (o.source || "")
                .replace("Price : ₹", "")
                .replace("/-", "")
            ) || 0,
        }))
      );

      setSupportChats(
        JSON.parse(localStorage.getItem("supportChats")) || {}
      );
    };

    loadOrders();
    const t = setInterval(loadOrders, 1000);
    return () => clearInterval(t);
  }, []);

  const handleViewInvoice = (orderId) => {
    localStorage.setItem("latestOrderId", orderId);
    navigate("/invoice");
  };

  const handleReorder = (orderId) => {
    const monitorOrders =
      JSON.parse(localStorage.getItem("monitorOrders")) || [];

    const order = monitorOrders.find((o) => o.id === orderId);
    if (!order) return;

    const cartItems = (order.items || "")
      .split(",")
      .map((it) => it.trim())
      .filter(Boolean)
      .map((entry) => {
        const m = entry.match(/^(\d+)\s*[×x]\s*(.+)$/);
        const name = m ? m[2] : entry;
        const quantity = m ? Number(m[1]) : 1;
        const price = getPrice(name);

        return {
          name,
          quantity,
          price,
          rate: price,
          cost: price,
          amount: price,
        };
      });

    localStorage.setItem("cart", JSON.stringify(cartItems));
    navigate("/cart");
  };

  /* ❌ UPDATED CANCEL HANDLER (LOGIC PRESERVED + RULES ADDED) */
  const handleCancel = (orderId) => {
    const monitorOrders =
      JSON.parse(localStorage.getItem("monitorOrders")) || [];

    const order = monitorOrders.find((o) => o.id === orderId);
    if (!order) return;

    if (order.status !== "Order Received") {
      setErrorMsg(
        "Your order is already getting prepared and cannot be cancelled."
      );
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    setSelectedOrderId(orderId);
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    if (!cancelReason) return;

    const monitorOrders =
      JSON.parse(localStorage.getItem("monitorOrders")) || [];

    const updated = monitorOrders.map((o) =>
      o.id === selectedOrderId
        ? { ...o, status: "Cancellation Requested", cancelReason }
        : o
    );

    localStorage.setItem("monitorOrders", JSON.stringify(updated));

    const cancelRequests =
      JSON.parse(localStorage.getItem("cancelRequests")) || {};
    cancelRequests[selectedOrderId] = "pending";
    localStorage.setItem("cancelRequests", JSON.stringify(cancelRequests));

    setShowCancelModal(false);
    setCancelReason("");
    setSelectedOrderId(null);
  };

  /* ✅ FINAL VISIBILITY RULE (UNCHANGED) */
  const cancelRequests =
    JSON.parse(localStorage.getItem("cancelRequests")) || {};

  const visibleOrders = orders.filter((o) => {
    if (o.rawStatus === "Cancelled") return false;
    if (cancelRequests[o.id] === "accepted") return false;

    return tab === "active"
      ? o.rawStatus !== "Delivered"
      : o.rawStatus === "Delivered";
  });

  return (
    <div className="orders-page">
      <div className="orders-header">
        <h2>Orders</h2>
      </div>

      {errorMsg && <div className="cancel-error">{errorMsg}</div>}

      <div className="orders-tabs">
        <button
          className={tab === "active" ? "tab active" : "tab"}
          onClick={() => setTab("active")}
        >
          Active
        </button>
        <button
          className={tab === "past" ? "tab active" : "tab"}
          onClick={() => setTab("past")}
        >
          Past
        </button>
      </div>

      <div className="orders-list">
        {visibleOrders.map((o) => (
          <div className="order-card" key={o.id}>
            <h3 className="restaurant-name">{o.restaurant}</h3>
            <p className="order-items">{o.items}</p>
            <p className="order-amount">₹{o.amount.toFixed(2)}</p>

            <p>Status: {o.rawStatus}</p>

            <div className="order-actions">
              <button
                className="invoice-btn"
                onClick={() => handleViewInvoice(o.id)}
              >
                View Invoice
              </button>

              {tab === "past" && (
                <button
                  className="reorder-btn"
                  onClick={() => handleReorder(o.id)}
                >
                  Reorder
                </button>
              )}
            </div>

            {tab === "active" && (
              <button
                className="reorder-btn"
                onClick={() => handleCancel(o.id)}
              >
                Cancel Order
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 🔥 CANCEL REASON MODAL */}
      {showCancelModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Cancel Order</h3>
            <p>Select a reason:</p>

            {CANCEL_REASONS.map((r) => (
              <label key={r} className="radio-option">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  onChange={() => setCancelReason(r)}
                />
                {r}
              </label>
            ))}

            <div className="modal-actions">
  <button
    onClick={() => {
      setShowCancelModal(false);
      setCancelReason("");
      setSelectedOrderId(null);
    }}
  >
    Close
  </button>

  <button
    className="Confirm-btn"
    disabled={!cancelReason}
    onClick={confirmCancel}
  >
    Confirm Cancel
  </button>
</div>

          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;