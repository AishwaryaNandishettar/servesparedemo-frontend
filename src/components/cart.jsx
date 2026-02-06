import React, { useEffect, useState } from "react";

import "../styles/cart.css";

const Cart = () => {
  const [cart, setCart] = useState([]);
  

  useEffect(() => {
    setCart(JSON.parse(localStorage.getItem("cart")) || []);
  }, []);

  const updateCart = (updated) => {
    setCart(updated);
    localStorage.setItem("cart", JSON.stringify(updated));
  };

  const increase = (i) => {
    const c = [...cart];
    c[i].quantity++;
    updateCart(c);
  };

  const decrease = (i) => {
    const c = [...cart];
    if (c[i].quantity > 1) c[i].quantity--;
    else c.splice(i, 1);
    updateCart(c);
  };

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <div className="cart-page">
      <div className="app-container">

        {/* Header */}
        <div className="cart-header">
          <h3>My Cart</h3>
        </div>

        {/* ✅ CONTENT WRAPPER (THIS FIXES ALIGNMENT) */}
        <div className="cart-content">

          {/* Cart Items */}
          <div className="cart-items">
            {cart.map((item, i) => (
              <div className="cart-item" key={i}>
                <img src={item.img} alt={item.name} />

                <div className="item-info">
                  <h4>{item.name}</h4>
                  <p>₹{item.price}</p>
                </div>

                <div className="qty-pill">
                  <button onClick={() => decrease(i)}>−</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => increase(i)}>+</button>
                </div>
              </div>
            ))}
          </div>

          {/* Coupon */}
          <div className="coupon">
            <span>Apply Coupon</span>
            <span>›</span>
          </div>

          {/* Total */}
          <div className="total-box">
            <span>Total</span>
            <span>₹{total}</span>
          </div>

        </div>

        {/* Pay Button */}
        <button className="pay-btn">Pay ₹{total}</button>

      </div>
    </div>
  );
};

export default Cart;
