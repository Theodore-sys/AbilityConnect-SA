CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS organisations (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  address TEXT, city TEXT, phone TEXT, email TEXT, website TEXT,
  accessibility TEXT, verified BOOLEAN DEFAULT false);
CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL,
  organisation TEXT, location TEXT, description TEXT, accessibility_notes TEXT,
  closing_date DATE);
CREATE TABLE IF NOT EXISTS saved_opportunities (
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id INT REFERENCES opportunities(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, opportunity_id));
CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL, message TEXT NOT NULL, status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now());
