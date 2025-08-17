import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import "./index.css";

const isLoggedIn = () => !!localStorage.getItem("admin-token");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            isLoggedIn() ? (
              <AdminDashboard />
            ) : (
              <Navigate to="/admin/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
