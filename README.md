# Antia 會員點數系統

單店會員點數系統：消費累點、QR Code 掃碼、店員扣點兌換、老闆後台報表。

## 技術

- 前端：純 HTML/JS（`public/`），手機優先 RWD
- 後端：Cloudflare Pages Functions（`functions/api/`）
- 資料庫：Cloudflare D1（SQLite）

## 角色

| 角色 | 權限 |
|---|---|
| member 會員 | 看餘額、明細、出示 QR Code |
| staff 店員 | 搜尋/掃碼找會員、加點、扣點兌換 |
| boss 老闆 | 店員權限 + 會員管理、補扣點、規則設定、報表 |
| admin 管理員 | 老闆權限 + 店員/老闆帳號管理 |

初始 admin 帳號：`admin` / `admin1234`（部署後請立即修改密碼）。

## 本地開發

```bash
npx wrangler d1 execute antia-members-db --local --file=schema.sql
npx wrangler pages dev
```

## 部署（Cloudflare Pages）

1. `npx wrangler d1 create antia-members-db`，把回傳的 `database_id` 填入 `wrangler.toml`
2. `npx wrangler d1 execute antia-members-db --remote --file=schema.sql`
3. Cloudflare Pages 連結此 GitHub repo，設定：
   - Build command：（留空）
   - Build output directory：`public`
   - 綁定 D1：變數名 `DB` → `antia-members-db`
   - 環境變數 `AUTH_SECRET`：隨機長字串（token 簽章密鑰）
4. 之後 push main 即自動部署

## 點數規則（後台可改）

- 預設每消費 100 元得 10 點，有效期 6 個月
- 兌換：1 點折 NT$1，由店員操作扣點
- 扣點採 FIFO：先扣快到期的批次
