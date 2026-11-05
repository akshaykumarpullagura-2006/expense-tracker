import { Link } from 'react-router-dom';
import {
  Users, Receipt, Wallet, BarChart2, Shield,
  Smartphone, ArrowRight, CheckCircle, Star,
} from 'lucide-react';

const features = [
  { icon: Users,    title: 'Multiple Groups',     desc: 'Trips, families, roommates, offices — manage any type of shared expense group.' },
  { icon: Receipt,  title: 'Smart Expense Tracking', desc: 'Add expenses, choose who paid, and split instantly among selected members.' },
  { icon: Wallet,   title: 'Live Balance Tracking', desc: 'Real-time balances calculated accurately to the last paise.' },
  { icon: BarChart2, title: 'Analytics & Reports', desc: 'Visual charts showing spending trends, category breakdowns and member contributions.' },
  { icon: Shield,   title: 'Secure by Design',    desc: 'Row-Level Security on every table. Your financial data is always private.' },
  { icon: Smartphone, title: 'Mobile Friendly',   desc: 'Fully responsive — works beautifully on phones, tablets and desktops.' },
];

const steps = [
  { n: '1', title: 'Create an account',  desc: 'Sign up with your email in seconds.' },
  { n: '2', title: 'Create a group',     desc: 'Set up a group for any occasion.' },
  { n: '3', title: 'Invite members',     desc: 'Invite people who already have accounts.' },
  { n: '4', title: 'Add expenses',       desc: 'Any member can add and split expenses.' },
  { n: '5', title: 'View balances',      desc: 'Instantly see who owes what.' },
  { n: '6', title: 'Settle up',          desc: 'Record payments and confirm receipts.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">₹</span>
            </div>
            <span className="text-lg font-bold text-gray-900">THE SPLIT EXPENSES</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login"  className="text-sm font-medium text-gray-600 hover:text-gray-900">Sign in</Link>
            <Link to="/signup" className="btn-primary text-sm py-2 px-4">Get started free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 text-sm text-emerald-700 font-medium mb-6">
          <Star className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />
          Free to use · No credit card required
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
          Share Together.<br />
          <span className="text-emerald-600">Split Fairly.</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
          The premium way to track shared expenses, split bills, and settle up with friends, family, and colleagues — all in one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/signup" className="btn-primary text-base py-3 px-8 flex items-center justify-center gap-2">
            Start for free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/login" className="btn-secondary text-base py-3 px-8">
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-3">Everything you need</h2>
          <p className="text-gray-500 text-center mb-12">Built for real-world shared expense management</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card hover:shadow-elevated transition-shadow">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-3">How it works</h2>
          <p className="text-gray-500 text-center mb-12">Get started in minutes</p>
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.n} className="flex items-start gap-4 p-5 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors">
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {step.n}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{step.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{step.desc}</p>
                </div>
                <CheckCircle className="w-5 h-5 text-emerald-400 ml-auto flex-shrink-0 mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-emerald-600 py-20 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to split fairly?</h2>
          <p className="text-emerald-100 mb-8">Join thousands managing shared expenses with The Split Expenses.</p>
          <Link to="/signup" className="inline-flex items-center gap-2 bg-white text-emerald-700 font-semibold py-3 px-8 rounded-xl hover:bg-emerald-50 transition-colors text-base">
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        <p>© 2026 THE SPLIT EXPENSES · Share Together. Split Fairly.</p>
      </footer>
    </div>
  );
}

