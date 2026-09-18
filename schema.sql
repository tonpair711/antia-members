-- xifun 喜翻會員點數系統 D1 schema
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS settings;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT UNIQUE,                    -- 手機號碼或 Email；店員手動建檔的免登入客戶為 NULL
  password_hash TEXT,                     -- PBKDF2-SHA256 hex；免登入客戶為 NULL
  salt TEXT,                              -- hex；免登入客戶為 NULL
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','staff','boss','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  birthday TEXT,                          -- MM-DD，選填，只存月日不存年
  referrer_id INTEGER REFERENCES users(id), -- 介紹人（另一位會員），選填
  note TEXT DEFAULT '',                   -- 會員備註，選填；例如自助註冊的會員是誰、跟誰介紹的
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_name ON users(name);
CREATE INDEX idx_users_phone ON users(phone);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('earn','redeem','adjust')),
  amount INTEGER DEFAULT 0,               -- 消費金額（earn 才有）
  points INTEGER NOT NULL,                -- 正=加點 負=扣點
  remaining INTEGER,                      -- 正點數批次的剩餘可用點數（FIFO 扣點用）
  expires_at TEXT,                        -- 正點數批次的到期日
  operator_id INTEGER REFERENCES users(id),
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tx_user ON transactions(user_id, created_at DESC);
CREATE INDEX idx_tx_fifo ON transactions(user_id, expires_at) WHERE remaining > 0;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('rate_amount', '100'),        -- 每消費 100 元
  ('rate_points', '10'),         -- 得 10 點
  ('validity_months', '6'),      -- 點數有效期 6 個月
  ('redeem_value', '1'),         -- 1 點折抵 NT$1
  ('report_reset_at', '1970-01-01 00:00:00'), -- 統計報表「全部」的起算時間，重置時更新這個值
  ('tier_silver_threshold', '100'), -- 累積拿過 100 點升銀卡
  ('tier_gold_threshold', '300'),   -- 累積拿過 300 點升金卡
  ('referral_bonus_points', '5');   -- 介紹一位好友給介紹人加的點數，0＝關閉這功能

-- 初始 admin 帳號（密碼 admin1234，首次登入請立即修改）
INSERT INTO users (account, password_hash, salt, name, role) VALUES
  ('admin',
   '7c251fd728cf8083b4c3408dbf3f0560791ad701fb3b48606e86e7aa16393ce0',
   'e1de89e81d68dce48e94d504c54b7537',
   '系統管理員', 'admin');
