# 💰 THE SPLIT EXPENSES — Share Together. Split Fairly.

A modern, full-stack group expense splitting web application built with **React 18**, **TypeScript**, **Tailwind CSS**, and **Supabase** (PostgreSQL, Row-Level Security, Auth, and Storage).

---

## ✨ Features

- **👥 Multi-User Group Management**
  - Create groups with custom currencies (INR ₹, USD $, EUR €, etc.) and group categories (Trip, Friends, Family, Roommates, Office, College, Events).
  - Role-based access control (Admin & Members).

- **🔢 6-Character Unique Group Invite Codes & Direct Links**
  - Instant group entry with a 6-character code (e.g. `#060455`) or 1-click shareable direct link.
  - WhatsApp share button to invite friends in seconds.

- **📱 Mobile Number Registration**
  - Collects user's mobile number during registration for WhatsApp messaging and identity.

- **⚖️ Pairwise "Give Money" & "Take Money" Net Debts**
  - Accurate net balance calculation with integer paise precision.
  - Automatically derives **"Give Money (You Owe)"** and **"Take Money (You are Owed)"** for every member.

- **🤝 Two-Party Settlement Confirmation Flow**
  - When a debtor clicks **"Settle Up"**, the payment is reported (`payment_reported`).
  - The recipient is prompted: *"Did this person settle this amount with you?"*
  - Debts are only cleared when the recipient clicks **"Yes, Confirm Settled"**.

- **💬 WhatsApp Payment Reminders**
  - 1-click **"Remind on WhatsApp"** button for anyone who owes you money.
  - Opens WhatsApp directly with a pre-filled, courteous reminder message with the exact amount and group link.

- **📊 Live Financial KPI Cards & Analytics**
  - Real-time KPI cards across Dashboard, Group Details, Balances, and Expenses.
  - Visual charts: Category distribution pie charts and Member contribution vs share bar charts using Recharts.

- **⚡ Realtime Supabase Subscriptions**
  - Changes made by other members reflect on your screen immediately without refreshing.

---

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts, React Router v6, React Hook Form, Zod.
- **Backend & Database:** Supabase (PostgreSQL 15+, Row-Level Security, PostgreSQL Functions/RPC, Triggers).
- **Hosting:** Vercel ready (with `vercel.json` SPA rewrites).

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/akshaykumarpullagura-2006/expense-tracker.git
cd expense-tracker
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file in the project root:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Database Setup
Execute the migration scripts located in `supabase/migrations/` inside your **Supabase SQL Editor**:
- `001_initial_schema.sql`
- `002_storage.sql`
- `003_fix_recursion.sql`
- `007_combined_features_and_settlement.sql` *(contains 6-digit codes, settlement confirmation flow, pairwise RPCs, and phone number trigger)*

### 5. Run local development server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Production Build
```bash
npm run build
```

---

## 📄 License
MIT License. Created with ❤️ by Akshay Kumar.
